#!/usr/bin/env node

/**
 * Secure configuration management for Claude webhook CLI
 * Avoids storing credentials in environment variables
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const CONFIG_DIR = path.join(process.env.HOME || '/tmp', '.claude-webhook');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const ENCRYPTED_CONFIG_FILE = path.join(CONFIG_DIR, 'config.enc');

// Create config directory if it doesn't exist
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Encrypt text using a key
 */
function encrypt(text, key) {
  const algorithm = 'aes-256-gcm';
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypt text using a key
 */
function decrypt(encryptedData, key) {
  const algorithm = 'aes-256-gcm';
  const salt = Buffer.from(encryptedData.salt, 'hex');
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const authTag = Buffer.from(encryptedData.authTag, 'hex');
  
  const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Prompt for password (hidden input)
 */
async function promptPassword(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, (password) => {
      rl.close();
      resolve(password);
    });
  });
}

/**
 * Save credentials securely
 */
async function saveConfig(config) {
  console.log('🔒 Setting up secure configuration...');
  
  const password = await promptPassword('Enter a password to encrypt your config: ');
  const confirmPassword = await promptPassword('Confirm password: ');
  
  if (password !== confirmPassword) {
    console.error('❌ Passwords do not match');
    process.exit(1);
  }
  
  const configJson = JSON.stringify(config, null, 2);
  const encrypted = encrypt(configJson, password);
  
  fs.writeFileSync(ENCRYPTED_CONFIG_FILE, JSON.stringify(encrypted, null, 2));
  fs.chmodSync(ENCRYPTED_CONFIG_FILE, 0o600);
  
  console.log('✅ Configuration saved securely');
}

/**
 * Load credentials securely
 */
async function loadConfig() {
  if (!fs.existsSync(ENCRYPTED_CONFIG_FILE)) {
    // Check for legacy plain config
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      await saveConfig(config);
      fs.unlinkSync(CONFIG_FILE); // Remove plain config
      return config;
    }
    return null;
  }
  
  const password = await promptPassword('Enter password to decrypt config: ');
  
  try {
    const encryptedData = JSON.parse(fs.readFileSync(ENCRYPTED_CONFIG_FILE, 'utf8'));
    const configJson = decrypt(encryptedData, password);
    return JSON.parse(configJson);
  } catch (error) {
    console.error('❌ Failed to decrypt config. Wrong password?');
    process.exit(1);
  }
}

/**
 * Initialize configuration
 */
async function initConfig() {
  console.log('🔧 Claude Webhook CLI Configuration');
  console.log('==================================\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
  
  const config = {
    apiUrl: await question('API URL (default: http://localhost:3003): ') || 'http://localhost:3003',
    githubToken: await question('GitHub Token: '),
    webhookSecret: await question('Webhook Secret: ')
  };
  
  rl.close();
  
  await saveConfig(config);
  
  console.log('\n✅ Configuration complete!');
  console.log('Your credentials are encrypted and stored securely.');
  console.log('You can now use the CLI without environment variables.');
}

/**
 * Get configuration
 */
async function getConfig() {
  let config = await loadConfig();
  
  if (!config) {
    console.log('No configuration found. Let\'s set it up!\n');
    await initConfig();
    config = await loadConfig();
  }
  
  return config;
}

// Export for use in CLI
module.exports = {
  getConfig,
  initConfig,
  CONFIG_DIR
};

// If run directly, initialize config
if (require.main === module) {
  initConfig().catch(console.error);
}