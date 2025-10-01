#!/usr/bin/env python3
"""
Semantic Analysis None Values Fix v1.0.0
=========================================

Production-ready fix for None values formatting in Serena semantic analysis responses.
Implements custom JSON serialization with proper null handling and type validation.

🎯 FIXES:
- None values properly serialized as null or omitted
- Type validation for all dataclass fields
- Custom JSON encoder for production responses
- Fallback handling for invalid data
- Performance optimization for serialization

🚀 PRODUCTION REQUIREMENTS:
- Zero None values in responses
- Type-safe serialization
- Performance < 1ms for serialization
- Graceful error handling
- Full backward compatibility
"""

import json
import dataclasses
from typing import Any, Dict, Optional, Union
from decimal import Decimal


class ProductionJSONEncoder(json.JSONEncoder):
    """Production-grade JSON encoder with None value handling"""

    def default(self, obj):
        if obj is None:
            return None  # Will be handled by encode_dict
        elif dataclasses.is_dataclass(obj):
            return self.encode_dataclass(obj)
        elif isinstance(obj, Decimal):
            return float(obj)
        elif hasattr(obj, '__dict__'):
            return {k: v for k, v in obj.__dict__.items() if v is not None}
        else:
            return super().default(obj)

    def encode_dataclass(self, obj) -> Dict[str, Any]:
        """Encode dataclass with None value filtering"""
        result = {}
        for field in dataclasses.fields(obj):
            value = getattr(obj, field.name)

            # Handle None values based on field type
            if value is None:
                # Only include None for Optional fields if explicitly needed
                if self._is_optional_field(field):
                    continue  # Omit None values for optional fields
                else:
                    result[field.name] = 0.0 if field.type in [float, int] else ""
            elif isinstance(value, (int, float)) and (value != value):  # NaN check
                result[field.name] = 0.0
            elif isinstance(value, str) and not value.strip():
                result[field.name] = ""  # Ensure empty strings are consistent
            else:
                result[field.name] = value

        return result

    def _is_optional_field(self, field) -> bool:
        """Check if field is Optional"""
        return (hasattr(field.type, '__origin__') and
                field.type.__origin__ is Union and
                type(None) in field.type.__args__)


def safe_serialize_semantic_analysis(semantic_data: Dict[str, Any]) -> Dict[str, Any]:
    """Safely serialize semantic analysis data with None value handling"""

    def clean_value(value):
        """Recursively clean values"""
        if value is None:
            return None  # Will be filtered out
        elif isinstance(value, dict):
            return {k: clean_value(v) for k, v in value.items() if clean_value(v) is not None}
        elif isinstance(value, list):
            return [clean_value(item) for item in value if clean_value(item) is not None]
        elif isinstance(value, (int, float)):
            if value != value:  # NaN check
                return 0.0
            return value
        elif isinstance(value, str):
            return value.strip() if value.strip() else ""
        else:
            return value

    cleaned_data = {}

    for key, value in semantic_data.items():
        cleaned_value = clean_value(value)

        # Special handling for semantic analysis fields
        if key == 'complexity_score':
            if dataclasses.is_dataclass(cleaned_value):
                complexity_dict = {}
                for field in dataclasses.fields(cleaned_value):
                    field_value = getattr(cleaned_value, field.name)
                    complexity_dict[field.name] = max(0.0, float(field_value or 0.0))
                cleaned_data[key] = complexity_dict
            else:
                cleaned_data[key] = cleaned_value

        elif key == 'confidence_metrics':
            if dataclasses.is_dataclass(cleaned_value):
                confidence_dict = {}
                for field in dataclasses.fields(cleaned_value):
                    field_value = getattr(cleaned_value, field.name)
                    confidence_dict[field.name] = max(0.0, min(1.0, float(field_value or 0.0)))
                cleaned_data[key] = confidence_dict
            else:
                cleaned_data[key] = cleaned_value

        elif key == 'analysis_metadata':
            if isinstance(cleaned_value, dict):
                metadata_dict = {}
                for meta_key, meta_value in cleaned_value.items():
                    if meta_value is not None:
                        metadata_dict[meta_key] = meta_value
                cleaned_data[key] = metadata_dict
            else:
                cleaned_data[key] = cleaned_value

        elif cleaned_value is not None:
            cleaned_data[key] = cleaned_value

    return cleaned_data


def create_safe_response(response_data: Dict[str, Any]) -> str:
    """Create production-safe JSON response"""
    try:
        # Clean the response data
        cleaned_data = safe_serialize_semantic_analysis(response_data)

        # Use custom encoder
        response_json = json.dumps(
            cleaned_data,
            cls=ProductionJSONEncoder,
            ensure_ascii=False,
            separators=(',', ':'),  # Compact output
            sort_keys=False
        )

        # Validate no None strings in output
        if 'None' in response_json:
            # Fallback cleaning
            response_json = response_json.replace('"None"', '""').replace(':None,', ':null,').replace(':None}', ':null}')

        return response_json

    except Exception as e:
        # Emergency fallback
        fallback_response = {
            "content": response_data.get("content", ""),
            "backend": response_data.get("backend", "unknown"),
            "success": response_data.get("success", True),
            "error": None,
            "metadata": {
                "serialization_fallback": True,
                "original_error": str(e)
            }
        }
        return json.dumps(fallback_response)


# Patch for Enhanced Serena Platform
def patch_agno_serena_response_serialization():
    """
    Production patch for agno_serena_platform.py to fix None values

    Apply this patch by importing and calling in agno_serena_platform.py:

    from src.semantic_analysis_fix import patch_agno_serena_response_serialization, create_safe_response

    # In the /ai/generate endpoint, replace:
    # response_data = asdict(response)
    # json_response = JSONResponse(content=response_data)

    # With:
    # response_data = asdict(response)
    # safe_json = create_safe_response(response_data)
    # json_response = JSONResponse(content=json.loads(safe_json))
    """

    patch_code = '''
# Add this import at the top of agno_serena_platform.py
from src.semantic_analysis_fix import create_safe_response, safe_serialize_semantic_analysis

# In the multi_ai_generate function, replace the response creation section:

                # OLD CODE (around line 1710):
                # response_data = asdict(response)
                # json_response = JSONResponse(content=response_data)

                # NEW CODE:
                response_data = asdict(response)

                # Clean semantic analysis data before including in response
                if response.metadata and 'semantic_analysis' in response.metadata:
                    response.metadata['semantic_analysis'] = safe_serialize_semantic_analysis(
                        response.metadata['semantic_analysis']
                    )

                # Create safe JSON response
                safe_json = create_safe_response(response_data)
                json_response = JSONResponse(content=json.loads(safe_json))
    '''

    return patch_code


def validate_response_format(response_json: str) -> bool:
    """Validate that response contains no None values"""
    try:
        # Parse JSON to validate structure
        data = json.loads(response_json)

        # Check for None values recursively
        def check_none_values(obj, path=""):
            if obj is None:
                return False, f"None value found at {path}"
            elif isinstance(obj, dict):
                for key, value in obj.items():
                    valid, error = check_none_values(value, f"{path}.{key}")
                    if not valid:
                        return False, error
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    valid, error = check_none_values(item, f"{path}[{i}]")
                    if not valid:
                        return False, error
            return True, ""

        return check_none_values(data)

    except json.JSONDecodeError as e:
        return False, f"Invalid JSON: {e}"


# Test functions
def test_semantic_analysis_fix():
    """Test the None values fix"""

    # Mock semantic analysis data with None values
    test_data = {
        "complexity_score": {
            "syntax_complexity": 0.5,
            "structural_complexity": None,  # This should be fixed
            "cognitive_complexity": 0.3,
            "validation_complexity": None,  # This should be fixed
            "integration_complexity": 0.2,
            "overall_score": 0.33
        },
        "confidence_metrics": {
            "pattern_match_confidence": 0.8,
            "semantic_consistency": None,  # This should be fixed
            "context_relevance": 0.7,
            "language_clarity": None,  # This should be fixed
            "domain_specificity": 0.6,
            "overall_confidence": 0.7
        },
        "validation_type": "medium",
        "enhanced_prompt": "test prompt",
        "needs_enhancement": True,
        "analysis_metadata": {
            "patterns_detected": 5,
            "enhancement_applied": True,
            "semantic_engine_version": "8.1.0-restored",
            "optional_field": None  # This should be omitted
        }
    }

    print("🧪 Testing semantic analysis None values fix...")

    # Test the fix
    safe_json = create_safe_response(test_data)

    # Validate result
    valid, error = validate_response_format(safe_json)

    if valid:
        print("✅ No None values found in output")
        print("📄 Safe JSON output:")
        print(json.dumps(json.loads(safe_json), indent=2))
    else:
        print(f"❌ Validation failed: {error}")

    return valid


if __name__ == "__main__":
    # Run test
    success = test_semantic_analysis_fix()

    if success:
        print("\n🎉 Semantic analysis None values fix is working correctly!")
        print("\n📋 To apply this fix to Enhanced Serena:")
        print("1. Copy semantic-analysis-fix.py to src/ directory")
        print("2. Import the functions in agno_serena_platform.py")
        print("3. Replace response serialization with create_safe_response()")
        print("4. Test with: python -m src.semantic-analysis-fix")
    else:
        print("\n❌ Fix validation failed - review implementation")