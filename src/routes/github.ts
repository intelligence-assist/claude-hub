import express from 'express';
import { handleWebhook } from '../controllers/githubController';

const router = express.Router();

// Legacy GitHub webhook endpoint - maintained for backward compatibility
// New webhooks should use /api/webhooks/github
router.post('/', handleWebhook as express.RequestHandler);

export default router;
