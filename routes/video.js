const express = require('express');
const router = express.Router();
const multer = require('multer');
const { auth, admin } = require('../middleware/auth');
const s3Service = require('../services/s3Service');
const logger = require('../utils/logger');

// Store chunks in memory for relaying to S3
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * Step 1: Initialize Multipart Upload
 * Returns UploadId and a unique fileKey
 */
router.post('/init', auth, admin, async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    if (!fileName || !fileType) {
      return res.status(400).json({ message: 'fileName and fileType are required' });
    }

    const fileKey = `briefings/${Date.now()}-${fileName}`;
    const uploadId = await s3Service.initializeMultipartUpload(fileKey, fileType);

    res.json({ uploadId, fileKey });
  } catch (err) {
    logger.error(err, 'Failed to initialize multipart upload');
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * Step 2: Upload a Chunk
 * Expects file chunk in 'chunk' field, partNumber, uploadId, and fileKey
 */
router.post('/chunk', auth, admin, upload.single('chunk'), async (req, res) => {
  try {
    const { uploadId, fileKey, partNumber } = req.body;
    const body = req.file.buffer;

    const eTag = await s3Service.uploadPart(fileKey, uploadId, parseInt(partNumber), body);

    res.json({ eTag });
  } catch (err) {
    logger.error(err, 'Failed to upload part');
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * Step 3: Complete Multipart Upload
 * Expects list of {ETag, PartNumber} objects
 */
router.post('/complete', auth, admin, async (req, res) => {
  try {
    const { uploadId, fileKey, parts } = req.body;
    if (!uploadId || !fileKey || !parts) {
      return res.status(400).json({ message: 'uploadId, fileKey, and parts are required' });
    }

    const videoUrl = await s3Service.completeMultipartUpload(fileKey, uploadId, parts);

    res.json({ message: 'Upload complete', videoUrl });
  } catch (err) {
    logger.error(err, 'Failed to complete multipart upload');
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * Optional: Get a pre-signed URL for a video
 */
router.get('/url/:key', auth, async (req, res) => {
  try {
    const url = await s3Service.getPresignedUrl(req.params.key);
    res.json({ url });
  } catch (err) {
    logger.error(err, 'Failed to get signed URL');
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
