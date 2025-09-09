/**
 * Response Quality Validator
 * Detects generic responses, validates code references, and prevents false positive effectiveness scores
 */

class ResponseQualityValidator {
    constructor() {
        this.genericPatterns = [
            // Generic advice patterns
            /generally,?\s+you\s+should/i,
            /typically,?\s+(you\s+)?would/i,
            /usually,?\s+(you\s+)?want/i,
            /it('s)?\s+(is\s+)?recommended/i,
            /best\s+practice\s+(is\s+)?to/i,
            /you\s+(should|could|might)\s+consider/i,
            /one\s+approach\s+(is\s+)?to/i,
            /a\s+common\s+(way|approach|method)/i,
            /in\s+most\s+cases/i,
            /depending\s+on\s+(your\s+)?needs/i,
            
            // Generic programming statements
            /you\s+(can|may|should)\s+use\s+\w+\.\w+\s*\(/i,
            /try\s+using\s+\w+\.\w+/i,
            /consider\s+implementing/i,
            /you\s+(might|could)\s+want\s+to\s+look\s+into/i,
            
            // Vague conclusions
            /this\s+(should|would|will)\s+help/i,
            /hope\s+this\s+helps/i,
            /let\s+me\s+know\s+if/i,
            /feel\s+free\s+to\s+ask/i,
            
            // False specificity claims (claiming to be specific while being generic)
            /line\s+\d+.*typically/i,
            /method.*generally/i,
            /function.*usually/i
        ];

        this.specificityIndicators = [
            // Good specificity indicators
            /line\s+\d+/i,
            /in\s+(the\s+)?function\s+\w+/i,
            /variable\s+\w+\s+(is|should|needs)/i,
            /method\s+\w+\s*\(/i,
            /class\s+\w+/i,
            /component\s+\w+/i,
            /in\s+(your\s+)?file\s+\w+\.\w+/i,
            /property\s+\w+/i,
            /parameter\s+\w+/i,
            /argument\s+\w+/i
        ];
    }

    /**
     * Main validation function that detects generic responses
     * @param {string} response - The response to validate
     * @param {object} context - Additional context like original prompt, file content, etc.
     * @returns {object} - Validation result with score and detailed reasons
     */
    validateResponse(response, context = {}) {
        const result = {
            score: 10,
            isGeneric: false,
            validationFailures: [],
            warnings: [],
            details: {}
        };

        // 1. Check for generic patterns
        const genericCheck = this.checkGenericPatterns(response);
        if (genericCheck.isGeneric) {
            result.score -= 3; // Major penalty for generic responses
            result.isGeneric = true;
            result.validationFailures.push(...genericCheck.patterns);
        }

        // 2. Check specificity
        const specificityCheck = this.checkSpecificity(response);
        if (specificityCheck.score < 3) {
            result.score -= 2; // Penalty for lack of specificity
            result.warnings.push(`Low specificity score: ${specificityCheck.score}/10`);
        }

        // 3. Validate method/function references if file content is provided
        if (context.fileContent) {
            const methodCheck = this.validateMethodReferences(response, context.fileContent);
            if (methodCheck.hasInvalidReferences) {
                // Only penalize if there are many invalid references (more than 2)
                const invalidCount = methodCheck.invalidMethods.length;
                if (invalidCount > 2) {
                    result.score -= 3; // Penalty for wrong method names
                    result.validationFailures.push(...methodCheck.invalidMethods.slice(0, 3).map(m => `Non-existent method: ${m}`));
                }
            }
        }

        // 4. Validate line number references if file content is provided
        if (context.fileContent) {
            const lineCheck = this.validateLineReferences(response, context.fileContent);
            if (lineCheck.hasInvalidLines) {
                // Strong penalty for wrong line numbers - this is a clear false positive indicator
                result.score -= 3;
                result.validationFailures.push(`Wrong line numbers: ${lineCheck.invalidLines.join(', ')}`);
                result.warnings.push(...lineCheck.invalidLines.map(l => `Invalid line reference: ${l}`));
            }
        }

        // 5. Check for actionable content
        const actionabilityCheck = this.checkActionability(response);
        if (actionabilityCheck.score < 2) {
            result.score -= 1; // Minor penalty for non-actionable responses
            result.warnings.push('Response lacks actionable content');
        }

        // 6. Validate response relevance to prompt
        if (context.prompt) {
            const relevanceCheck = this.checkRelevance(response, context.prompt);
            if (relevanceCheck.score < 3) {
                result.score -= 2; // Penalty for irrelevant responses
                result.warnings.push(`Low relevance to prompt: ${relevanceCheck.score}/10`);
            }
        }

        result.score = Math.max(0, result.score);
        result.details = {
            genericCheck,
            specificityCheck,
            methodCheck: context.fileContent ? this.validateMethodReferences(response, context.fileContent) : null,
            lineCheck: context.fileContent ? this.validateLineReferences(response, context.fileContent) : null,
            actionabilityCheck,
            relevanceCheck: context.prompt ? this.checkRelevance(response, context.prompt) : null
        };

        return result;
    }

    /**
     * Checks for generic programming advice patterns
     */
    checkGenericPatterns(response) {
        const foundPatterns = [];
        
        for (const pattern of this.genericPatterns) {
            const match = response.match(pattern);
            if (match) {
                foundPatterns.push({
                    pattern: pattern.source,
                    match: match[0],
                    index: match.index
                });
            }
        }

        return {
            isGeneric: foundPatterns.length > 0,
            patterns: foundPatterns,
            count: foundPatterns.length
        };
    }

    /**
     * Checks for specific vs generic language
     */
    checkSpecificity(response) {
        let specificityScore = 0;
        const foundIndicators = [];

        // Count specificity indicators
        for (const indicator of this.specificityIndicators) {
            const matches = response.match(new RegExp(indicator.source, 'gi'));
            if (matches) {
                specificityScore += matches.length;
                foundIndicators.push({
                    indicator: indicator.source,
                    count: matches.length
                });
            }
        }

        // Normalize score (0-10 scale)
        const normalizedScore = Math.min(10, specificityScore * 2);

        return {
            score: normalizedScore,
            indicators: foundIndicators,
            rawCount: specificityScore
        };
    }

    /**
     * Validates that referenced methods/functions actually exist in the provided code
     */
    validateMethodReferences(response, fileContent) {
        // Extract method references from response
        const methodReferences = this.extractMethodReferences(response);
        const actualMethods = this.extractActualMethods(fileContent);
        
        const invalidMethods = methodReferences.filter(ref => 
            !actualMethods.some(actual => 
                actual.toLowerCase() === ref.toLowerCase() || 
                actual.includes(ref) || 
                ref.includes(actual)
            )
        );

        return {
            hasInvalidReferences: invalidMethods.length > 0,
            invalidMethods,
            referencedMethods: methodReferences,
            actualMethods
        };
    }

    /**
     * Validates line number references against actual file content
     */
    validateLineReferences(response, fileContent) {
        const lineReferences = this.extractLineReferences(response);
        const totalLines = fileContent.split('\n').length;
        
        const invalidLines = lineReferences.filter(lineNum => 
            lineNum <= 0 || lineNum > totalLines
        );

        return {
            hasInvalidLines: invalidLines.length > 0,
            invalidLines,
            totalLines,
            referencedLines: lineReferences
        };
    }

    /**
     * Checks if response provides actionable information
     */
    checkActionability(response) {
        const actionablePatterns = [
            /```[\s\S]*?```/g, // Code blocks
            /step\s+\d+/gi,
            /change\s+line\s+\d+/gi,
            /replace\s+.*?\s+with/gi,
            /add\s+(the\s+)?following/gi,
            /modify\s+(the\s+)?function/gi,
            /update\s+(the\s+)?\w+/gi,
            /implement\s+\w+/gi,
            /create\s+(a\s+)?\w+/gi
        ];

        let actionableCount = 0;
        for (const pattern of actionablePatterns) {
            const matches = response.match(pattern);
            if (matches) {
                actionableCount += matches.length;
            }
        }

        return {
            score: Math.min(10, actionableCount * 2),
            actionableElements: actionableCount
        };
    }

    /**
     * Checks relevance of response to the original prompt
     */
    checkRelevance(response, prompt) {
        // Extract key terms from prompt
        const promptTerms = this.extractKeyTerms(prompt);
        const responseTerms = this.extractKeyTerms(response);
        
        // Calculate intersection
        const commonTerms = promptTerms.filter(term => 
            responseTerms.some(respTerm => 
                respTerm.toLowerCase().includes(term.toLowerCase()) ||
                term.toLowerCase().includes(respTerm.toLowerCase())
            )
        );

        const relevanceScore = promptTerms.length > 0 
            ? (commonTerms.length / promptTerms.length) * 10 
            : 0;

        return {
            score: relevanceScore,
            promptTerms,
            responseTerms,
            commonTerms
        };
    }

    /**
     * Extract method/function names from text
     */
    extractMethodReferences(text) {
        const methodPatterns = [
            /\b(\w{3,})\s*\(/g, // function calls (3+ chars)
            /\.(\w{3,})\s*\(/g, // method calls (3+ chars)
            /function\s+(\w+)/g, // function declarations
            /method\s+(\w+)/gi, // mentioned methods
            /calls?\s+(\w{3,})/gi // "call UpdateAI" (3+ chars)
        ];

        const methods = new Set();
        const commonWords = new Set(['the', 'and', 'for', 'you', 'are', 'can', 'use', 'get', 'set', 'new', 'old', 'add', 'all', 'any', 'but', 'not', 'now', 'out', 'way', 'may', 'see', 'him', 'two', 'how', 'its', 'who', 'did', 'yes', 'has', 'had', 'let', 'put', 'too', 'say', 'she', 'try', 'ask', 'own', 'run', 'lot', 'why', 'man', 'big', 'end', 'few', 'got', 'off', 'old', 'own', 'say', 'she', 'two', 'way']);
        
        for (const pattern of methodPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const methodName = match[1];
                if (methodName && 
                    methodName.length > 2 && 
                    !commonWords.has(methodName.toLowerCase()) &&
                    /^[A-Za-z][A-Za-z0-9]*$/.test(methodName)) { // Valid identifier
                    methods.add(methodName);
                }
            }
        }

        return Array.from(methods);
    }

    /**
     * Extract actual method names from file content
     */
    extractActualMethods(fileContent) {
        const methodPatterns = [
            /function\s+(\w+)/g,
            /(\w+)\s*\(/g,
            /\.(\w+)\s*=/g,
            /class\s+\w+[\s\S]*?(\w+)\s*\(/g
        ];

        const methods = new Set();
        
        for (const pattern of methodPatterns) {
            let match;
            while ((match = pattern.exec(fileContent)) !== null) {
                if (match[1] && match[1].length > 1) {
                    methods.add(match[1]);
                }
            }
        }

        return Array.from(methods);
    }

    /**
     * Extract line number references from text
     */
    extractLineReferences(text) {
        const linePattern = /line\s+(\d+)/gi;
        const lines = [];
        let match;
        
        while ((match = linePattern.exec(text)) !== null) {
            lines.push(parseInt(match[1]));
        }

        return lines;
    }

    /**
     * Extract key terms from text
     */
    extractKeyTerms(text) {
        // Remove common words and extract meaningful terms
        const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);
        
        return text.toLowerCase()
            .split(/\W+/)
            .filter(word => word.length > 2 && !commonWords.has(word))
            .filter((word, index, array) => array.indexOf(word) === index); // Remove duplicates
    }

    /**
     * Quick validation for existing code - backwards compatible
     */
    assessResponseQuality(response, testCase = {}) {
        const context = {
            prompt: testCase.prompt || '',
            fileContent: testCase.fileContent || null
        };

        const validation = this.validateResponse(response, context);
        
        // Return score compatible with existing code
        return validation.score;
    }
}

export default ResponseQualityValidator;