# CONTRIBUTING.md

# Contributing to MKG Server v8.0.0

## 🤝 Welcome Contributors!

We appreciate your interest in contributing to MKG Server! This guide will help you get started with contributing to this advanced AI routing system.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## 📜 Code of Conduct

### Our Pledge

We are committed to fostering an open and welcoming environment. As contributors and maintainers, we pledge to making participation in our project a harassment-free experience for everyone.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behavior includes:**
- Trolling, insulting/derogatory comments, and personal attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the project team at conduct@mkg-server.dev. All complaints will be reviewed and investigated promptly and fairly.

## 🚀 Getting Started

### Prerequisites

Before contributing, ensure you have:
- **Node.js 18+** installed
- **Git** for version control
- **Docker** and Docker Compose (for local model testing)
- **NVIDIA GPU** (optional, for local model development)
- Basic understanding of JavaScript/ES6+ and async programming

### Quick Start

1. **Fork the repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/your-username/mkg-server.git
   cd mkg-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run tests**
   ```bash
   npm test
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## 🔧 Development Setup

### Environment Configuration

Create a `.env` file for development:
```bash
# Development environment
NODE_ENV=development
MCP_SERVER_MODE=true
DEBUG=true
LOG_LEVEL=debug

# Local model (optional for testing)
DEEPSEEK_ENDPOINT=http://localhost:8001/v1
MKG_SERVER_PORT=8001

# API keys for testing (optional)
NVIDIA_API_KEY=your-test-api-key

# Development settings
CACHE_TTL=60
HEALTH_CHECK_INTERVAL=10
VALIDATION_ENABLED=false
```

### Development Tools

#### Recommended VSCode Extensions
```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-json",
    "bradlc.vscode-tailwindcss",
    "ms-playwright.playwright"
  ]
}
```

#### VSCode Settings
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.autoFixOnSave": true,
  "javascript.preferences.importModuleSpecifier": "relative"
}
```

### Local Model Setup (Optional)

For testing with local models:
```bash
# Start development model
docker-compose -f docker-compose.qwen2.5-coder-7b-8001.yml up -d

# Verify model is running
curl http://localhost:8001/health
```

## 📝 Contributing Guidelines

### Types of Contributions

We welcome various types of contributions:

#### 🐛 Bug Fixes
- Fix existing functionality issues
- Improve error handling
- Resolve performance problems

#### ✨ New Features
- Add new AI providers
- Implement new tools
- Enhance routing logic
- Improve user experience

#### 📚 Documentation
- Update README and guides
- Add code examples
- Improve API documentation
- Create tutorials

#### 🧪 Testing
- Add unit tests
- Create integration tests
- Improve test coverage
- Add performance benchmarks

#### 🎨 Code Quality
- Refactor existing code
- Improve performance
- Enhance security
- Update dependencies

### Contribution Areas

#### Priority Areas for Contribution

1. **New AI Providers**
   - Add support for Anthropic Claude
   - Integrate Google Gemini
   - Support for local Ollama models
   - Custom provider templates

2. **Tool Enhancements**
   - Advanced code analysis tools
   - Database query optimization
   - Documentation generation
   - Testing framework integration

3. **Performance Improvements**
   - Caching optimizations
   - Request batching
   - Memory usage reduction
   - Response time optimization

4. **Developer Experience**
   - Better error messages
   - Improved logging
   - Development tools
   - CLI interface

5. **Security Enhancements**
   - Input sanitization
   - Rate limiting improvements
   - Authentication mechanisms
   - Audit logging

### Coding Standards

#### JavaScript/Node.js Standards

```javascript
// Use ES6+ features
import { promises as fs } from 'fs';
import path from 'path';

// Use async/await over promises
async function readFileContent(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw error;
  }
}

// Use descriptive variable names
const userAuthenticationToken = generateToken();
const isUserAuthenticated = await validateToken(userAuthenticationToken);

// Add JSDoc comments for functions
/**
 * Analyzes code complexity and returns metrics
 * @param {string} code - Source code to analyze
 * @param {string} language - Programming language
 * @returns {Promise<Object>} Analysis results with complexity metrics
 */
async function analyzeCodeComplexity(code, language) {
  // Implementation
}
```

#### Error Handling

```javascript
// Use specific error types
class MKGValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'MKGValidationError';
    this.field = field;
  }
}

// Proper error handling in async functions
async function processRequest(request) {
  try {
    const validatedRequest = await validateRequest(request);
    const result = await processValidatedRequest(validatedRequest);
    return result;
  } catch (error) {
    if (error instanceof MKGValidationError) {
      console.error(`Validation error in field ${error.field}:`, error.message);
      throw new McpError(ErrorCode.InvalidParams, error.message);
    }

    console.error('Unexpected error during request processing:', error);
    throw new McpError(ErrorCode.InternalError, 'Request processing failed');
  }
}
```

#### Code Organization

```javascript
// Organize imports logically
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import fs from 'fs/promises';
import path from 'path';

import { config } from './config.js';
import { MechaKingGhidorahRouter } from './router.js';

// Use consistent class structure
class MKGFeature {
  constructor(config = {}) {
    this.config = { ...this.defaultConfig, ...config };
    this.initialize();
  }

  get defaultConfig() {
    return {
      enabled: true,
      timeout: 5000
    };
  }

  async initialize() {
    // Initialization logic
  }

  async execute(params) {
    // Feature implementation
  }
}
```

### Git Workflow

#### Branch Naming Convention

```bash
# Feature branches
feature/add-claude-provider
feature/improve-caching-system
feature/add-typescript-support

# Bug fix branches
bugfix/fix-routing-timeout
bugfix/resolve-memory-leak
bugfix/correct-validation-logic

# Documentation branches
docs/update-api-reference
docs/add-contributing-guide
docs/improve-examples

# Hotfix branches
hotfix/critical-security-fix
hotfix/urgent-performance-fix
```

#### Commit Message Format

```bash
# Format: type(scope): description
#
# Types: feat, fix, docs, style, refactor, test, chore
# Scope: area of codebase affected (optional)
# Description: what the commit does

# Examples:
feat(routing): add support for Anthropic Claude provider
fix(validation): resolve input sanitization issue
docs(examples): add React component generation examples
test(router): add comprehensive routing tests
refactor(cache): improve memory usage in caching system
chore(deps): update dependencies to latest versions
```

## 🔄 Pull Request Process

### Before Submitting

1. **Ensure your code follows standards**
   ```bash
   npm run lint
   npm run format
   ```

2. **Run all tests**
   ```bash
   npm test
   npm run test:integration
   ```

3. **Update documentation**
   - Update README if needed
   - Add/update JSDoc comments
   - Update configuration examples

4. **Test your changes**
   - Test with different configurations
   - Verify backward compatibility
   - Test edge cases

### PR Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## How Has This Been Tested?
- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing
- [ ] Performance testing

## Screenshots/Examples
If applicable, add screenshots or code examples.

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Code is commented, particularly in hard-to-understand areas
- [ ] Corresponding changes made to documentation
- [ ] Changes generate no new warnings
- [ ] Tests added that prove fix is effective or feature works
- [ ] New and existing unit tests pass locally
```

### Review Process

1. **Automated Checks**
   - CI/CD pipeline runs
   - Code quality checks
   - Security scanning
   - Test coverage analysis

2. **Code Review**
   - At least one maintainer review
   - Focus on code quality, security, performance
   - Feedback and suggestions provided

3. **Final Approval**
   - All checks pass
   - Approved by maintainer
   - Ready for merge

## 🐛 Issue Reporting

### Bug Reports

Use the bug report template:

```markdown
**Bug Description**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Configure MKG server with '...'
2. Call tool '....'
3. Observe error

**Expected Behavior**
A clear description of what you expected to happen.

**Environment**
- OS: [e.g. Ubuntu 22.04]
- Node.js version: [e.g. 18.17.0]
- MKG Server version: [e.g. 8.0.0]
- Local model: [e.g. Qwen3-Coder-30B-FP8]

**Additional Context**
- Configuration files
- Log output
- Screenshots if applicable
```

### Feature Requests

```markdown
**Feature Description**
A clear and concise description of the feature you'd like to see.

**Use Case**
Explain the problem this feature would solve.

**Proposed Solution**
Describe your preferred solution.

**Alternatives Considered**
Describe alternative solutions you've considered.

**Additional Context**
Any other context, mockups, or examples.
```

## 🧪 Testing

### Test Structure

```javascript
// test/example.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MechaKingGhidorahRouter } from '../src/router.js';

describe('MKG Router', () => {
  let router;

  beforeEach(() => {
    router = new MechaKingGhidorahRouter({
      // Test configuration
    });
  });

  afterEach(() => {
    // Cleanup
  });

  describe('endpoint selection', () => {
    it('should select local endpoint for simple tasks', async () => {
      const prompt = 'Simple coding task';
      const endpoint = await router.selectOptimalEndpoint(prompt);

      expect(endpoint.name).toContain('Local');
    });

    it('should escalate complex tasks to cloud', async () => {
      const prompt = 'Complex analysis ' + 'x'.repeat(10000);
      const endpoint = await router.selectOptimalEndpoint(prompt);

      expect(endpoint.name).toContain('NVIDIA');
    });
  });
});
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Integration tests
npm run test:integration

# Performance tests
npm run test:performance
```

### Writing Tests

#### Unit Tests
- Test individual functions
- Mock external dependencies
- Focus on edge cases
- Aim for high coverage

#### Integration Tests
- Test component interactions
- Use real dependencies when possible
- Test configuration scenarios
- Validate end-to-end workflows

#### Performance Tests
- Measure response times
- Test under load
- Monitor memory usage
- Validate caching effectiveness

## 📚 Documentation

### Documentation Standards

#### Code Documentation
```javascript
/**
 * Processes AI routing request with smart endpoint selection
 *
 * @param {Object} request - The request object
 * @param {Array} request.messages - Chat messages
 * @param {string} request.model - Preferred model (optional)
 * @param {Object} options - Additional options
 * @param {string} options.taskType - Task type for routing
 * @param {number} options.maxTokens - Maximum tokens
 * @returns {Promise<Object>} Processed response with metadata
 *
 * @example
 * const response = await router.processRequest({
 *   messages: [{ role: 'user', content: 'Analyze this code' }]
 * }, { taskType: 'analysis' });
 */
async processRequest(request, options = {}) {
  // Implementation
}
```

#### README Updates
- Keep examples current
- Update feature lists
- Maintain configuration guides
- Include troubleshooting steps

#### API Documentation
- Document all tools
- Include parameter descriptions
- Provide usage examples
- Show expected responses

### Documentation Workflow

1. **Write docs alongside code**
2. **Update examples when APIs change**
3. **Review for clarity and accuracy**
4. **Test all code examples**
5. **Update configuration guides**

## 👥 Community

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General discussion and questions
- **Discord Server**: Real-time chat and community support
- **Email**: conduct@mkg-server.dev for code of conduct issues

### Getting Help

1. **Check existing documentation**
2. **Search closed issues**
3. **Ask in GitHub Discussions**
4. **Join our Discord community**

### Community Guidelines

- **Be respectful and inclusive**
- **Help others when you can**
- **Share knowledge and experiences**
- **Provide constructive feedback**
- **Follow the code of conduct**

## 🎯 Maintainer Information

### Core Maintainers
- Primary maintainer responsibilities
- Review and merge process
- Release management
- Community management

### Becoming a Maintainer

Regular contributors may be invited to become maintainers based on:
- Quality and frequency of contributions
- Community involvement
- Technical expertise
- Commitment to project values

## 📈 Project Roadmap

### Current Priorities
1. **Performance optimization**
2. **New AI provider integrations**
3. **Enhanced tool capabilities**
4. **Improved documentation**
5. **Community growth**

### Future Plans
- Plugin system architecture
- Web-based configuration interface
- Advanced analytics and monitoring
- Multi-language support

Thank you for contributing to MKG Server! Together, we're building the future of AI-powered development tools. 🚀