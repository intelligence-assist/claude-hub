# Pre-commit Hook Setup

This project uses pre-commit hooks to ensure code quality and prevent secrets from being committed.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install pre-commit hooks:
   ```bash
   npx pre-commit install
   ```

   Or if you have Python's pre-commit installed globally:
   ```bash
   pre-commit install
   ```

## Features

### 1. Code Quality Checks
- Trailing whitespace removal
- End of file fixer
- YAML syntax validation
- JSON syntax validation
- Large file detection

### 2. Credential Scanning
The pre-commit hooks include two credential scanners:

#### detect-secrets
- Scans for various types of secrets (AWS keys, GitHub tokens, etc.)
- Maintains a baseline file (`.secrets.baseline`) to track allowed secrets
- To update the baseline after addressing false positives:
  ```bash
  detect-secrets scan > .secrets.baseline
  ```
- To audit the baseline:
  ```bash
  detect-secrets audit .secrets.baseline
  ```

#### gitleaks
- Additional credential scanning with different detection patterns
- Scans for hardcoded secrets, API keys, and sensitive information
- Uses regular expressions and entropy analysis

## Usage

Pre-commit hooks run automatically when you commit. To run manually:
```bash
pre-commit run --all-files
```

To run a specific hook:
```bash
pre-commit run detect-secrets
pre-commit run gitleaks
```

## Bypassing Hooks (Emergency Only)

If you need to bypass the hooks in an emergency:
```bash
git commit --no-verify
```

⚠️ **Warning**: Only bypass hooks when absolutely necessary and ensure no secrets are committed.

## Adding Exceptions

If you have a false positive:

1. For detect-secrets, add a comment on the same line:
   ```javascript
   const example = "not-a-real-secret"; // pragma: allowlist secret
   ```

2. For gitleaks, create or update `.gitleaksignore` file

## Troubleshooting

If hooks fail to install:
1. Ensure Python is installed: `python --version`
2. Install pre-commit globally: `pip install pre-commit`
3. Clear and reinstall: `pre-commit clean && pre-commit install`