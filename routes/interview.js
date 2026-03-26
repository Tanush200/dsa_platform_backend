const express = require('express');
const router = express.Router();
const InterviewQuestion = require('../models/InterviewQuestion');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const questions = await InterviewQuestion.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching interview questions' });
  }
});

const languageToStack = {
  javascript: 'Node.js',
  json: 'MongoDB',
  go: 'Go Fiber',
  sql: 'MySQL',
  python: 'Python',
  java: 'Java',
  html: 'HTML',
  css: 'CSS',
  markdown: 'General'
};

router.post('/', auth, async (req, res) => {
  try {
    const { question, answer, language, codeSnippet } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ message: 'Question and answer are required' });
    }

    const lang = language || 'javascript';
    const stack = languageToStack[lang] || 'General';

    const newQuestion = new InterviewQuestion({
      user: req.user.id,
      stack,
      question,
      answer,
      language: lang,
      codeSnippet: codeSnippet || ''
    });

    const savedQuestion = await newQuestion.save();
    res.status(201).json(savedQuestion);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating interview question' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { question, answer, language, codeSnippet } = req.body;

    let interviewQuestion = await InterviewQuestion.findById(req.params.id);

    if (!interviewQuestion) {
      return res.status(404).json({ message: 'Interview question not found' });
    }

    if (interviewQuestion.user.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this question' });
    }

    const lang = language || 'javascript';
    const stack = languageToStack[lang] || 'General';

    interviewQuestion = await InterviewQuestion.findByIdAndUpdate(
      req.params.id,
      { $set: { stack, question, answer, language: lang, codeSnippet } },
      { new: true }
    );

    res.json(interviewQuestion);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating interview question' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const interviewQuestion = await InterviewQuestion.findById(req.params.id);

    if (!interviewQuestion) {
      return res.status(404).json({ message: 'Interview question not found' });
    }

    if (interviewQuestion.user.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this question' });
    }

    await interviewQuestion.deleteOne();

    res.json({ message: 'Interview question removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting interview question' });
  }
});

module.exports = router;
