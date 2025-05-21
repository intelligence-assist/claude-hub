const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createLogger } = require('./logger');

const logger = createLogger('repoAnalyzer');

/**
 * Analyzes a Git repository structure and content
 * @class RepoAnalyzer
 */
class RepoAnalyzer {
  /**
   * Creates an instance of RepoAnalyzer
   * @param {Object} options - Configuration options
   * @param {string} options.repoPath - Path to the repository
   * @param {string} options.repoFullName - Full name of the repository (owner/repo)
   */
  constructor({ repoPath, repoFullName }) {
    this.repoPath = repoPath;
    this.repoFullName = repoFullName;
    this.analysis = {
      repoFullName,
      structure: {},
      readme: null,
      technologies: [],
      mainLanguage: null,
      commitStats: {
        totalCommits: 0,
        contributors: 0,
        lastCommitDate: null
      }
    };
  }

  /**
   * Clones the repository if it doesn't exist
   * @param {string} branch - Branch name to checkout
   * @returns {boolean} - True if cloned, false if already exists
   */
  cloneRepo(branch = 'main') {
    try {
      if (!fs.existsSync(this.repoPath)) {
        logger.info(`Cloning repository ${this.repoFullName} to ${this.repoPath}`);
        // Create parent directories if they don't exist
        fs.mkdirSync(path.dirname(this.repoPath), { recursive: true });
        
        // Clone the repository
        execSync(
          `git clone https://github.com/${this.repoFullName}.git ${this.repoPath}`,
          { stdio: 'pipe' }
        );
        
        // Checkout specific branch if provided
        if (branch && branch !== 'main') {
          try {
            execSync(`git checkout ${branch}`, { cwd: this.repoPath, stdio: 'pipe' });
          } catch (branchError) {
            logger.warn(`Failed to checkout branch ${branch}: ${branchError.message}`);
          }
        }
        
        return true;
      } else {
        logger.info(`Repository ${this.repoFullName} already exists at ${this.repoPath}`);
        
        // Update the repository
        try {
          execSync('git fetch origin', { cwd: this.repoPath, stdio: 'pipe' });
          
          // Try to checkout the branch
          if (branch) {
            try {
              execSync(`git checkout ${branch}`, { cwd: this.repoPath, stdio: 'pipe' });
            } catch (checkoutError) {
              try {
                execSync(`git checkout origin/${branch} -b ${branch}`, { cwd: this.repoPath, stdio: 'pipe' });
              } catch (newBranchError) {
                logger.warn(`Failed to checkout branch ${branch}: ${newBranchError.message}`);
              }
            }
          }
          
          // Pull latest changes
          execSync('git pull', { cwd: this.repoPath, stdio: 'pipe' });
        } catch (gitError) {
          logger.warn(`Error updating repository: ${gitError.message}`);
        }
        
        return false;
      }
    } catch (error) {
      logger.error(`Error cloning repository: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyzes the repository structure
   * @returns {Object} - Object representing repository structure
   */
  analyzeStructure() {
    try {
      logger.info(`Analyzing repository structure for ${this.repoFullName}`);
      
      // Function to scan directory and return structure
      const scanDir = (dirPath, depth = 2, maxDepth = 3) => {
        if (depth > maxDepth) return null;
        
        const result = {};
        const items = fs.readdirSync(path.join(this.repoPath, dirPath), { withFileTypes: true });
        
        for (const item of items) {
          // Skip .git directory and node_modules
          if (item.name === '.git' || item.name === 'node_modules') continue;
          
          const itemPath = path.join(dirPath, item.name);
          
          if (item.isDirectory()) {
            if (depth < maxDepth) {
              const subDir = scanDir(itemPath, depth + 1, maxDepth);
              if (subDir && Object.keys(subDir).length > 0) {
                result[item.name] = subDir;
              } else {
                result[item.name] = '[DIR]';
              }
            } else {
              result[item.name] = '[DIR]';
            }
          } else {
            result[item.name] = '[FILE]';
          }
        }
        
        return result;
      };
      
      this.analysis.structure = scanDir('', 1);
      return this.analysis.structure;
    } catch (error) {
      logger.error(`Error analyzing repository structure: ${error.message}`);
      this.analysis.structure = { error: error.message };
      return this.analysis.structure;
    }
  }

  /**
   * Finds and parses the README file
   * @returns {string|null} - README content or null if not found
   */
  findReadme() {
    try {
      logger.info(`Finding README for ${this.repoFullName}`);
      
      // Common README file names
      const readmePatterns = [
        'README.md',
        'README.markdown',
        'README',
        'README.txt',
        'Readme.md'
      ];
      
      let readmeContent = null;
      
      for (const pattern of readmePatterns) {
        const readmePath = path.join(this.repoPath, pattern);
        if (fs.existsSync(readmePath)) {
          readmeContent = fs.readFileSync(readmePath, 'utf8');
          logger.info(`Found README at ${pattern}`);
          break;
        }
      }
      
      this.analysis.readme = readmeContent;
      return readmeContent;
    } catch (error) {
      logger.error(`Error finding README: ${error.message}`);
      return null;
    }
  }

  /**
   * Detects main technologies used in the repository
   * @returns {Array<string>} - List of detected technologies
   */
  detectTechnologies() {
    try {
      logger.info(`Detecting technologies for ${this.repoFullName}`);
      
      const technologies = new Set();
      
      // Check for package.json (Node.js)
      if (fs.existsSync(path.join(this.repoPath, 'package.json'))) {
        technologies.add('Node.js');
        technologies.add('JavaScript');
        
        // Check for specific JS frameworks
        try {
          const packageJson = JSON.parse(fs.readFileSync(path.join(this.repoPath, 'package.json'), 'utf8'));
          const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
          
          if (dependencies) {
            if (dependencies.react) technologies.add('React');
            if (dependencies.vue) technologies.add('Vue.js');
            if (dependencies.angular || dependencies['@angular/core']) technologies.add('Angular');
            if (dependencies.express) technologies.add('Express');
            if (dependencies.next) technologies.add('Next.js');
            if (dependencies.typescript) technologies.add('TypeScript');
          }
        } catch (e) {
          logger.warn(`Error parsing package.json: ${e.message}`);
        }
      }
      
      // Check for requirements.txt or setup.py (Python)
      if (
        fs.existsSync(path.join(this.repoPath, 'requirements.txt')) ||
        fs.existsSync(path.join(this.repoPath, 'setup.py'))
      ) {
        technologies.add('Python');
      }
      
      // Check for pom.xml or build.gradle (Java)
      if (
        fs.existsSync(path.join(this.repoPath, 'pom.xml')) ||
        fs.existsSync(path.join(this.repoPath, 'build.gradle'))
      ) {
        technologies.add('Java');
      }
      
      // Check for Gemfile (Ruby)
      if (fs.existsSync(path.join(this.repoPath, 'Gemfile'))) {
        technologies.add('Ruby');
      }
      
      // Check for go.mod (Go)
      if (fs.existsSync(path.join(this.repoPath, 'go.mod'))) {
        technologies.add('Go');
      }
      
      // Check for Dockerfile (Docker)
      if (fs.existsSync(path.join(this.repoPath, 'Dockerfile'))) {
        technologies.add('Docker');
      }
      
      // Check for .tf files (Terraform)
      try {
        if (execSync(`find ${this.repoPath} -name "*.tf" | head -1`, { stdio: 'pipe' }).toString().trim()) {
          technologies.add('Terraform');
        }
      } catch (e) {
        // Ignore find errors
      }
      
      this.analysis.technologies = Array.from(technologies);
      return this.analysis.technologies;
    } catch (error) {
      logger.error(`Error detecting technologies: ${error.message}`);
      return [];
    }
  }

  /**
   * Gets basic statistics about the repository
   * @returns {Object} - Repository statistics
   */
  getRepoStats() {
    try {
      logger.info(`Getting repository stats for ${this.repoFullName}`);
      
      // Try to get the main language using git
      try {
        const languages = execSync(`cd ${this.repoPath} && git ls-files | grep -v "^\\." | sed 's/.*\\.//g' | sort | uniq -c | sort -nr`, { stdio: 'pipe' }).toString().trim();
        const languageMatch = languages.match(/^\s*\d+\s+(\w+)/m);
        
        if (languageMatch && languageMatch[1]) {
          this.analysis.mainLanguage = languageMatch[1];
        }
      } catch (e) {
        logger.warn(`Error detecting main language: ${e.message}`);
      }
      
      // Get commit statistics
      try {
        // Total commit count
        const totalCommits = execSync(`cd ${this.repoPath} && git rev-list --count HEAD`, { stdio: 'pipe' }).toString().trim();
        this.analysis.commitStats.totalCommits = parseInt(totalCommits, 10) || 0;
        
        // Contributor count
        const contributors = execSync(`cd ${this.repoPath} && git log --format='%ae' | sort -u | wc -l`, { stdio: 'pipe' }).toString().trim();
        this.analysis.commitStats.contributors = parseInt(contributors, 10) || 0;
        
        // Last commit date
        const lastCommitDate = execSync(`cd ${this.repoPath} && git log -1 --format=%cd`, { stdio: 'pipe' }).toString().trim();
        this.analysis.commitStats.lastCommitDate = lastCommitDate;
      } catch (e) {
        logger.warn(`Error getting commit stats: ${e.message}`);
      }
      
      return this.analysis.commitStats;
    } catch (error) {
      logger.error(`Error getting repository stats: ${error.message}`);
      return {};
    }
  }

  /**
   * Performs a full analysis of the repository
   * @param {string} branch - Branch to analyze
   * @returns {Object} - Full repository analysis
   */
  async analyzeRepository(branch = 'main') {
    try {
      logger.info(`Starting full repository analysis for ${this.repoFullName}`);
      
      // Clone or update the repository
      this.cloneRepo(branch);
      
      // Run all analysis methods
      this.analyzeStructure();
      this.findReadme();
      this.detectTechnologies();
      this.getRepoStats();
      
      return this.analysis;
    } catch (error) {
      logger.error(`Error in full repository analysis: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Generates a summary of the repository
   * @returns {string} - Markdown formatted summary
   */
  generateSummary() {
    try {
      const { repoFullName, technologies, mainLanguage, commitStats, readme } = this.analysis;
      const techList = technologies.join(', ') || 'Unknown';
      
      // Extract title from README if available
      let title = repoFullName.split('/')[1];
      let description = '';
      
      if (readme) {
        // Try to extract a title from the README
        const titleMatch = readme.match(/^#\s+(.*?)$/m);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim();
        }
        
        // Try to extract a description (first paragraph after title)
        const descMatch = readme.match(/^#.*?\n\n(.*?)(\n\n|$)/ms);
        if (descMatch && descMatch[1]) {
          description = descMatch[1].trim();
        }
      }
      
      return `# ${title}

## Repository Analysis

**Repository:** [${repoFullName}](https://github.com/${repoFullName})

**Description:**
${description || 'No description available.'}

**Technologies:** ${techList}
**Main Language:** ${mainLanguage || 'Unknown'}
**Commit Stats:** ${commitStats.totalCommits || 0} commits by ${commitStats.contributors || 0} contributors
${commitStats.lastCommitDate ? `**Last Updated:** ${commitStats.lastCommitDate}` : ''}

## Repository Structure

${this.formatStructure(this.analysis.structure)}

## Getting Started

Based on the repository analysis, here are some recommendations for working with this codebase:

${this.generateRecommendations()}`;
    } catch (error) {
      logger.error(`Error generating summary: ${error.message}`);
      return `# Repository Analysis for ${this.repoFullName}

Failed to generate a complete summary due to an error: ${error.message}`;
    }
  }

  /**
   * Formats the repository structure as markdown
   * @param {Object} structure - Repository structure object
   * @param {number} level - Current nesting level
   * @returns {string} - Formatted structure
   */
  formatStructure(structure, level = 0) {
    if (!structure || typeof structure !== 'object') {
      return 'Unable to analyze repository structure.';
    }
    
    let result = '';
    const indent = '  '.repeat(level);
    
    // Sort keys: directories first, then files, alphabetically
    const sortedKeys = Object.keys(structure).sort((a, b) => {
      const aIsDir = structure[a] === '[DIR]' || typeof structure[a] === 'object';
      const bIsDir = structure[b] === '[DIR]' || typeof structure[b] === 'object';
      
      // Directories first
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      
      // Alphabetical within same type
      return a.localeCompare(b);
    });
    
    for (const key of sortedKeys) {
      const value = structure[key];
      
      if (value === '[DIR]') {
        // Directory with no displayed children
        result += `${indent}- 📁 ${key}/\n`;
      } else if (value === '[FILE]') {
        // File
        result += `${indent}- 📄 ${key}\n`;
      } else if (typeof value === 'object') {
        // Directory with children
        result += `${indent}- 📁 ${key}/\n`;
        result += this.formatStructure(value, level + 1);
      }
    }
    
    return result;
  }

  /**
   * Generates tailored recommendations based on repository analysis
   * @returns {string} - Markdown formatted recommendations
   */
  generateRecommendations() {
    const { technologies, mainLanguage } = this.analysis;
    let recommendations = '';
    
    // Installation/setup recommendations based on technologies
    if (technologies.includes('Node.js')) {
      recommendations += `### Installation

\`\`\`bash
# Clone the repository
git clone https://github.com/${this.repoFullName}.git
cd ${this.repoFullName.split('/')[1]}

# Install dependencies
npm install

# Start the application
npm start
\`\`\``;
    } else if (technologies.includes('Python')) {
      recommendations += `### Installation

\`\`\`bash
# Clone the repository
git clone https://github.com/${this.repoFullName}.git
cd ${this.repoFullName.split('/')[1]}

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\\Scripts\\activate

# Install dependencies
pip install -r requirements.txt
\`\`\``;
    } else {
      recommendations += `### General Workflow

1. Clone the repository
\`\`\`bash
git clone https://github.com/${this.repoFullName}.git
cd ${this.repoFullName.split('/')[1]}
\`\`\`

2. Explore the codebase
3. Follow any setup instructions in the README`;
    }
    
    // Add framework-specific recommendations
    if (technologies.includes('React')) {
      recommendations += `

### React Development

- Run development server: \`npm start\` or \`npm run dev\`
- Build for production: \`npm run build\`
- Run tests: \`npm test\``;
    } else if (technologies.includes('Vue.js')) {
      recommendations += `

### Vue.js Development

- Run development server: \`npm run serve\` or \`npm run dev\`
- Build for production: \`npm run build\`
- Run tests: \`npm run test\``;
    }
    
    return recommendations;
  }
}

module.exports = RepoAnalyzer;