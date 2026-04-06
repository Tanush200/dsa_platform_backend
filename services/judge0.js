const axios = require('axios');


const LANGUAGE_IDS = {
    javascript: 63,
    python: 71,
    cpp: 54,
    java: 62,
    c: 50
};


const JUDGE0_HEADERS = {
    'x-rapidapi-key': process.env.JUDGE0_API_KEY,
    'x-rapidapi-host': 'judge0-ce.p.rapidapi.com',
    'Content-Type': 'application/json'
};

async function submitCode({ code, language, stdin = "" }) {
    const languageId = LANGUAGE_IDS[language];

    if (!languageId) throw new Error(`Unsupported language: ${language}`);

    try {
        const response = await axios.post(
            `${process.env.JUDGE0_API_URL}/submissions?base64_encoded=false&wait=false`,
            {
                source_code: code,
                language_id: languageId,
                stdin
            },
            { headers: JUDGE0_HEADERS }
        );
        return response.data.token;
    } catch (err) {
        if (err.response) {
            console.error('Judge0 400 Error Details:', err.response.data);
            throw new Error(`Judge0 API Error: ${JSON.stringify(err.response.data)}`);
        }
        throw err;
    }
};

async function getResult(token, retries = 8, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        await new Promise(res => setTimeout(res, delay));

        const response = await axios.get(
            `${process.env.JUDGE0_API_URL}/submissions/${token}?base64_encoded=false`,
            { headers: JUDGE0_HEADERS }
        );

        const { status, stdout, stderr, compile_output, time } = response.data;

        if (status.id <= 2) continue;

        return {
            statusId: status.id,
            statusDesc: status.description,
            passed: status.id === 3,
            stdout: stdout?.trim() || '',
            stderr: stderr || compile_output || '',
            timeMs: time ? Math.round(parseFloat(time) * 1000) : null
        };
    }

    throw new Error('Judge0 timed out waiting for result');
}


async function runAgainstTestCase({ code, language, input, expectedOutput }) {
    const token = await submitCode({ code, language, stdin: input });
    const result = await getResult(token);
    const actualOutput = result.stdout?.trim();
    const expected = expectedOutput?.trim();
    return {
        ...result,
        passed: result.passed && actualOutput === expected,
        actualOutput,
        expectedOutput: expected
    };
}


async function runAgainstTestCase({ code, language, input, expectedOutput }) {
    const token = await submitCode({ code, language, stdin: input });
    const result = await getResult(token);
    const actualOutput = result.stdout?.trim();
    const expected = expectedOutput?.trim();
    return {
        ...result,
        passed: result.passed && actualOutput === expected,
        actualOutput,
        expectedOutput: expected
    };
}



async function runAllTestCases({ code, language, testCases }) {
    const results = [];
    for (const tc of testCases) {
        try {
            const result = await runAgainstTestCase({
                code,
                language,
                input: tc.input,
                expectedOutput: tc.expectedOutput
            });
            results.push({ ...result, isHidden: tc.isHidden });
        } catch (err) {
            results.push({
                passed: false,
                statusDesc: 'Error',
                stderr: err.message,
                isHidden: tc.isHidden
            });
        }
    }
    const passed = results.every(r => r.passed);
    const passedCount = results.filter(r => r.passed).length;
    const avgTimeMs = results.reduce((s, r) => s + (r.timeMs || 0), 0) / results.length;
    return {
        passed,
        passedCount,
        totalCount: results.length,
        avgTimeMs: Math.round(avgTimeMs),
        results: results.map(r => ({

            passed: r.passed,
            statusDesc: r.statusDesc,
            stderr: r.stderr,
            timeMs: r.timeMs,
            isHidden: r.isHidden,

            ...(r.isHidden ? {} : {
                actualOutput: r.actualOutput,
                expectedOutput: r.expectedOutput
            })
        }))
    };
}


module.exports = { runAllTestCases, runAgainstTestCase, LANGUAGE_IDS };