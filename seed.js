const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();
const Problem = require('./models/Problem');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => { console.error('Connection error:', err); process.exit(1); });

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const runSeed = async () => {
  try {
    const raw = fs.readFileSync('data.csv', 'utf-8');

    // Normalize all line endings to \n (fixes the ≥ break issue)
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const allLines = normalized.split('\n');

    // Skip markdown header lines (Source:, ---, blank lines before headers)
    // Find the actual CSV header line
    let headerIdx = allLines.findIndex(l => l.startsWith('Topic,Pattern,No.,Problem'));
    if (headerIdx === -1) {
      console.error('Could not find CSV header row!');
      process.exit(1);
    }

    const dataLines = allLines.slice(headerIdx + 1); // data rows only

    const problems = [];
    let currentTopic = 'Uncategorized';
    let currentPattern = 'General';

    for (const rawLine of dataLines) {
      const line = rawLine.trim();
      if (!line) continue; // skip blank lines

      const cols = parseCSVLine(line);
      // CSV columns: Topic, Pattern, No., Problem, Status, Revision Status, ...
      const [topicCol, patternCol, noCol, problemCol] = cols;

      if (topicCol && topicCol !== '') {
        // Strip leading digits like "1.Array " → "Array"
        currentTopic = topicCol.replace(/^\d+\./, '').trim();
      }
      if (patternCol && patternCol !== '') {
        // Strip trailing ⭐ or extra whitespace
        currentPattern = patternCol.replace('⭐', '').trim();
      }

      // Only add rows with a problem number AND problem name
      if (noCol && noCol !== '' && problemCol && problemCol !== '' && problemCol !== 'Problem') {
        problems.push({
          title: problemCol,
          topic: currentTopic,
          pattern: currentPattern,
          difficulty: 'Medium',
          leetcodeLink: ''
        });
      }
    }

    console.log(`Parsed ${problems.length} valid problems from spreadsheet.`);
    console.log('Clearing old problem database...');
    await Problem.deleteMany({});

    console.log('Injecting problems into MongoDB...');
    await Problem.insertMany(problems);

    console.log(`✅ Successfully seeded ${problems.length} problems!`);

    // Clean up
    fs.unlinkSync('data.csv');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

runSeed();
