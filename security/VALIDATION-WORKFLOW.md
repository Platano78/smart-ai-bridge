# Security Validation Workflow Documentation

**Version**: 1.3.0  
**Last Updated**: December 9, 2025

---

## Overview

This document describes the continuous security validation framework for Smart AI Bridge. The framework automates security testing through local scripts, CI/CD pipelines, and pre-commit hooks.

---

## Components

### 1. Master Validation Script

**Location**: `security/validate-security.sh`

**Usage**:
```bash
# Quick validation (essential tests only)
./security/validate-security.sh --quick

# Full validation (all tests)
./security/validate-security.sh --full

# CI mode (optimized for pipelines)
./security/validate-security.sh --ci
```

**Tests Executed**:
| Mode | Core Tests | OWASP Tests | npm audit | Secrets |
|------|------------|-------------|-----------|--------|
| Quick | ✓ | | ✓ | ✓ |
| Full | ✓ | ✓ | ✓ | ✓ |
| CI | ✓ | ✓ | ✓ | ✓ |

**Output**:
- Console summary with pass/fail status
- JSON report in `security/reports/security-report-TIMESTAMP.json`

---

### 2. GitHub Actions Workflow

**Location**: `.github/workflows/security-validation.yml`

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main`
- Weekly scheduled run (Sundays at midnight)
- Manual workflow dispatch

**Jobs**:

| Job | Description | Blocking |
|-----|-------------|----------|
| `security-validation` | Runs all security test suites | Yes |
| `dependency-audit` | Checks for vulnerable dependencies | Yes (critical) |
| `secret-detection` | Scans for hardcoded secrets | Warning |
| `security-score` | Calculates and reports score | No |

**Integration**:
- Fails PR if critical vulnerabilities found
- Creates summary badge with security score
- Reports to GitHub Security tab (if enabled)

---

### 3. Pre-commit Hooks

**Setup**:
```bash
# Install pre-commit hooks
npm run setup-hooks

# Or manually:
cp security/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Checks on Commit**:
1. Secret detection (API keys, passwords, tokens)
2. Sensitive file patterns (`.env`, `*.pem`, `credentials.*`)
3. Large file warnings (>1MB)

**Bypass** (use sparingly):
```bash
git commit --no-verify -m "Emergency fix"
```

---

### 4. Test Suites

#### Core Security Tests
**File**: `security-tests.js`
**Coverage**: Authentication, authorization, input validation basics

#### Security Hardening Tests
**File**: `security-hardening-tests.js`
**Coverage**: Defense-in-depth, secure defaults, error handling

#### OWASP API Security Tests
**File**: `security/tests/owasp-api-security-tests.js`
**Coverage**: All 10 OWASP API Security categories

#### Input Validation Attack Tests
**File**: `security/tests/input-validation-attacks.js`
**Coverage**: SQL injection, XSS, command injection, path traversal

#### DoS Protection Tests
**File**: `security/tests/dos-resource-exhaustion-tests.js`
**Coverage**: Rate limiting, circuit breaker, resource limits

---

## Validation Schedule

| Frequency | Validation Type | Automated |
|-----------|-----------------|----------|
| Every commit | Pre-commit hooks | Yes |
| Every push | CI security tests | Yes |
| Every PR | Full validation + audit | Yes |
| Weekly | Comprehensive scan | Yes |
| Monthly | Manual security review | No |
| Quarterly | External audit | No |

---

## Pass/Fail Criteria

### Passing Conditions
- ≥ 95% of tests passing
- No critical vulnerabilities in dependencies
- No secrets detected in code
- Security score ≥ 8.0/10

### Blocking Conditions (Fails Build)
- Critical npm audit vulnerabilities
- Verified secrets in commits
- Core security test failures

### Warning Conditions (Non-blocking)
- High npm audit vulnerabilities
- Potential secret patterns (unverified)
- Security score between 7.0-8.0

---

## Reporting

### JSON Report Format
```json
{
  "timestamp": "2025-12-09T16:00:00Z",
  "version": "1.3.0",
  "mode": "full",
  "results": {
    "total_tests": 125,
    "passed": 119,
    "failed": 6,
    "pass_rate": 95.2,
    "threshold": 95
  },
  "status": "PASSED"
}
```

### Report Locations
- Local: `security/reports/security-report-TIMESTAMP.json`
- CI: GitHub Actions artifacts
- Summary: GitHub PR/commit summary

---

## Troubleshooting

### Common Issues

**1. Tests failing locally but passing in CI**
- Check Node.js version match
- Ensure all dependencies installed: `npm ci`
- Verify test file paths

**2. npm audit showing false positives**
- Review with `npm audit --json`
- Add to `.nsprc` if verified false positive
- Document in `security/known-issues.md`

**3. Secret detection false positives**
- Use `.gitleaksignore` for known safe patterns
- Add context comments in code
- Document in PR description

**4. Pre-commit hook too slow**
- Use `--quick` mode for development
- Run full validation before PR only

---

## Maintenance

### Adding New Tests
1. Create test file in `security/tests/`
2. Add to `validate-security.sh`
3. Add to GitHub Actions workflow
4. Update this documentation

### Updating Thresholds
1. Edit `PASS_THRESHOLD` in `validate-security.sh`
2. Update `security/SCORING-METHODOLOGY.md`
3. Update CI workflow if needed

### Reviewing Reports
1. Check `security/reports/` for historical data
2. Review trends in pass rates
3. Update gap analysis as issues are fixed

---

## Related Documents

- `security/SCORING-METHODOLOGY.md` - Scoring criteria
- `security/SECURITY-SCORECARD-v1.3.0.md` - Current scores
- `security/GAP-ANALYSIS-REPORT.md` - Known gaps
- `security/HANDOFF-SECURITY-VALIDATION.md` - Session handoff

---

**Document Control**
| Version | Date | Changes |
|---------|------|--------|
| 1.0 | 2025-12-09 | Initial workflow documentation |
