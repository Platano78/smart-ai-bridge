#!/usr/bin/env python3
"""
Sample Python File for YoutAgent Testing
This file contains various Python patterns to test file analysis
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union, Any
from dataclasses import dataclass, field
from contextlib import asynccontextmanager
import functools

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class PlayerStats:
    """Player statistics with validation"""
    health: int = 100
    mana: int = 50
    experience: int = 0
    level: int = 1
    last_updated: datetime = field(default_factory=datetime.now)
    
    def __post_init__(self):
        """Validate stats after initialization"""
        if self.health < 0:
            raise ValueError("Health cannot be negative")
        if self.level < 1:
            raise ValueError("Level must be at least 1")


class GameSessionManager:
    """Advanced game session management with async operations"""
    
    def __init__(self, max_concurrent_sessions: int = 100):
        self.max_concurrent_sessions = max_concurrent_sessions
        self.active_sessions: Dict[str, Any] = {}
        self.session_stats = {
            'created': 0,
            'active': 0,
            'completed': 0,
            'failed': 0
        }
        self._lock = asyncio.Lock()
    
    async def create_session(self, session_id: str, player_data: Dict) -> Dict:
        """Create a new game session with validation"""
        async with self._lock:
            if len(self.active_sessions) >= self.max_concurrent_sessions:
                raise RuntimeError(f"Maximum concurrent sessions reached: {self.max_concurrent_sessions}")
            
            if session_id in self.active_sessions:
                logger.warning(f"Session {session_id} already exists, returning existing session")
                return self.active_sessions[session_id]
            
            try:
                # Validate player data
                stats = PlayerStats(**player_data.get('stats', {}))
                
                session = {
                    'id': session_id,
                    'player': {
                        'name': player_data.get('name', 'Unknown'),
                        'stats': stats,
                        'inventory': player_data.get('inventory', []),
                        'position': player_data.get('position', {'x': 0, 'y': 0, 'z': 0})
                    },
                    'created_at': datetime.now(),
                    'last_activity': datetime.now(),
                    'state': 'active'
                }
                
                self.active_sessions[session_id] = session
                self.session_stats['created'] += 1
                self.session_stats['active'] += 1
                
                logger.info(f"Created session {session_id} for player {session['player']['name']}")
                return session
                
            except Exception as error:
                self.session_stats['failed'] += 1
                logger.error(f"Failed to create session {session_id}: {error}")
                raise
    
    @asynccontextmanager
    async def session_context(self, session_id: str):
        """Context manager for safe session operations"""
        session = self.active_sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        try:
            session['last_activity'] = datetime.now()
            yield session
        except Exception as error:
            logger.error(f"Error in session {session_id}: {error}")
            session['state'] = 'error'
            raise
        finally:
            if session.get('state') != 'error':
                session['state'] = 'completed'
    
    async def update_player_stats(self, session_id: str, stat_updates: Dict) -> bool:
        """Update player statistics with validation"""
        try:
            async with self.session_context(session_id) as session:
                current_stats = session['player']['stats']
                
                # Create new stats with updates
                updated_data = {
                    'health': stat_updates.get('health', current_stats.health),
                    'mana': stat_updates.get('mana', current_stats.mana),
                    'experience': stat_updates.get('experience', current_stats.experience),
                    'level': stat_updates.get('level', current_stats.level)
                }
                
                # Validate new stats
                new_stats = PlayerStats(**updated_data)
                session['player']['stats'] = new_stats
                
                logger.info(f"Updated stats for session {session_id}: {updated_data}")
                return True
                
        except Exception as error:
            logger.error(f"Failed to update stats for session {session_id}: {error}")
            return False
    
    def get_session_summary(self) -> Dict:
        """Get comprehensive session statistics"""
        active_sessions = [s for s in self.active_sessions.values() if s['state'] == 'active']
        
        return {
            'statistics': self.session_stats.copy(),
            'active_count': len(active_sessions),
            'average_session_time': self._calculate_average_session_time(),
            'player_levels': self._get_level_distribution(),
            'memory_usage': len(str(self.active_sessions)) / 1024  # Rough KB estimate
        }
    
    def _calculate_average_session_time(self) -> float:
        """Calculate average session duration in minutes"""
        if not self.active_sessions:
            return 0.0
        
        total_time = timedelta()
        count = 0
        
        for session in self.active_sessions.values():
            if session.get('created_at'):
                duration = datetime.now() - session['created_at']
                total_time += duration
                count += 1
        
        return total_time.total_seconds() / 60 / count if count > 0 else 0.0
    
    def _get_level_distribution(self) -> Dict[int, int]:
        """Get distribution of player levels"""
        distribution = {}
        
        for session in self.active_sessions.values():
            level = session['player']['stats'].level
            distribution[level] = distribution.get(level, 0) + 1
        
        return distribution


# Decorators for performance monitoring
def performance_monitor(func):
    """Decorator to monitor function performance"""
    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        start_time = datetime.now()
        try:
            result = await func(*args, **kwargs)
            duration = (datetime.now() - start_time).total_seconds()
            logger.info(f"{func.__name__} completed in {duration:.3f}s")
            return result
        except Exception as error:
            duration = (datetime.now() - start_time).total_seconds()
            logger.error(f"{func.__name__} failed after {duration:.3f}s: {error}")
            raise
    
    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs):
        start_time = datetime.now()
        try:
            result = func(*args, **kwargs)
            duration = (datetime.now() - start_time).total_seconds()
            logger.info(f"{func.__name__} completed in {duration:.3f}s")
            return result
        except Exception as error:
            duration = (datetime.now() - start_time).total_seconds()
            logger.error(f"{func.__name__} failed after {duration:.3f}s: {error}")
            raise
    
    return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper


@performance_monitor
async def simulate_game_loop(session_manager: GameSessionManager, iterations: int = 100):
    """Simulate game loop operations for testing"""
    logger.info(f"Starting game loop simulation with {iterations} iterations")
    
    # Create test sessions
    test_sessions = []
    for i in range(min(10, iterations)):
        session_id = f"test_session_{i}"
        player_data = {
            'name': f'TestPlayer{i}',
            'stats': {
                'health': 100 - (i * 5),
                'mana': 50 + (i * 2),
                'experience': i * 100,
                'level': max(1, i // 2)
            }
        }
        
        try:
            session = await session_manager.create_session(session_id, player_data)
            test_sessions.append(session['id'])
        except Exception as error:
            logger.error(f"Failed to create test session {session_id}: {error}")
    
    # Simulate updates
    for iteration in range(iterations):
        for session_id in test_sessions:
            try:
                await session_manager.update_player_stats(session_id, {
                    'experience': iteration * 10,
                    'health': max(10, 100 - (iteration % 90))
                })
            except Exception as error:
                logger.error(f"Failed to update session {session_id}: {error}")
        
        # Small delay to prevent overwhelming
        await asyncio.sleep(0.01)
    
    return session_manager.get_session_summary()


# Main execution
async def main():
    """Main function for testing YoutAgent file analysis"""
    logger.info("Starting YoutAgent Python file test")
    
    session_manager = GameSessionManager(max_concurrent_sessions=50)
    
    # Run simulation
    summary = await simulate_game_loop(session_manager, 50)
    
    logger.info("Simulation Summary:")
    logger.info(json.dumps(summary, indent=2, default=str))
    
    return summary


if __name__ == "__main__":
    print("YoutAgent Python Test File - Ready for analysis!")
    # asyncio.run(main())  # Commented out to prevent execution during file read