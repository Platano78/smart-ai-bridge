"""
Deep-level Python utility for testing recursive directory scanning
This file should be detected by YoutAgent's detectFiles method
"""

from typing import Generic, TypeVar, List, Optional, Callable
import math

T = TypeVar('T')


class Vector3Generic(Generic[T]):
    """Generic 3D vector implementation for testing nested directory detection"""
    
    def __init__(self, x: T, y: T, z: T):
        self.x = x
        self.y = y
        self.z = z
    
    def __str__(self) -> str:
        return f"Vector3({self.x}, {self.y}, {self.z})"
    
    def __repr__(self) -> str:
        return self.__str__()


class MathUtils:
    """Mathematical utilities for game development"""
    
    @staticmethod
    def lerp(start: float, end: float, t: float) -> float:
        """Linear interpolation between two values"""
        return start + (end - start) * max(0.0, min(1.0, t))
    
    @staticmethod
    def clamp(value: float, min_val: float, max_val: float) -> float:
        """Clamp value between min and max"""
        return max(min_val, min(max_val, value))
    
    @staticmethod
    def smoothstep(edge0: float, edge1: float, x: float) -> float:
        """Smooth interpolation with ease-in-out behavior"""
        t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)
    
    @staticmethod
    def distance_3d(p1: Vector3Generic[float], p2: Vector3Generic[float]) -> float:
        """Calculate 3D distance between two points"""
        dx = p2.x - p1.x
        dy = p2.y - p1.y
        dz = p2.z - p1.z
        return math.sqrt(dx * dx + dy * dy + dz * dz)


def fibonacci_generator(n: int) -> List[int]:
    """Generate fibonacci sequence up to n terms"""
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    elif n == 2:
        return [0, 1]
    
    sequence = [0, 1]
    for i in range(2, n):
        sequence.append(sequence[i-1] + sequence[i-2])
    
    return sequence


# Factory pattern example
class ComponentFactory:
    """Factory for creating game components"""
    
    _creators = {}
    
    @classmethod
    def register(cls, component_type: str, creator: Callable):
        """Register a component creator"""
        cls._creators[component_type] = creator
    
    @classmethod
    def create(cls, component_type: str, *args, **kwargs):
        """Create a component of specified type"""
        creator = cls._creators.get(component_type)
        if not creator:
            raise ValueError(f"Unknown component type: {component_type}")
        return creator(*args, **kwargs)


# Test data for YoutAgent analysis
TEST_DATA = {
    "file_location": "nested-directory/deep-level/utils.py",
    "purpose": "Test recursive directory scanning",
    "features": [
        "Generic types",
        "Mathematical utilities",
        "Factory pattern",
        "Type hints",
        "Documentation strings"
    ]
}

print("Deep-level utility file loaded - YoutAgent recursive test successful!")