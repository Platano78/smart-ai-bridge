import time
from typing import List, Dict, Optional

class MonitoringTestAlgorithm:
    def __init__(self):
        self.monitoring_data: Dict[str, float] = {}
        self.performance_metrics: List[float] = []
        self.alert_threshold = 0.95
        
    def collect_monitoring_data(self, source: str, value: float) -> None:
        """Collect performance data from various sources."""
        timestamp = time.time()
        self.monitoring_data[f"{source}_{timestamp}"] = value
        
        print(f"Collected monitoring data from {source}: {value}")
        
        # Maintain rolling window of last 100 metrics
        self.performance_metrics.append(value)
        if len(self.performance_metrics) > 100:
            self.performance_metrics.pop(0)
    
    def analyze_performance_trend(self) -> Dict[str, float]:
        """Analyze recent performance trends."""
        if len(self.performance_metrics) < 10:
            return {"status": "insufficient_data"}
            
        recent_avg = sum(self.performance_metrics[-10:]) / 10
        overall_avg = sum(self.performance_metrics) / len(self.performance_metrics)
        trend_ratio = recent_avg / overall_avg if overall_avg > 0 else 0
        
        analysis = {
            "recent_average": recent_avg,
            "overall_average": overall_avg, 
            "trend_ratio": trend_ratio,
            "performance_status": "improving" if trend_ratio > 1.05 
                                 else "degrading" if trend_ratio < 0.95 
                                 else "stable"
        }
        
        print(f"Performance analysis: {analysis['performance_status']}")
        return analysis
    
    def generate_monitoring_report(self) -> str:
        """Generate comprehensive monitoring report."""
        analysis = self.analyze_performance_trend()
        
        report = f"""
MONITORING ALGORITHM REPORT
===========================
Data Points Collected: {len(self.monitoring_data)}
Performance Metrics: {len(self.performance_metrics)}
Recent Average: {analysis.get('recent_average', 0):.3f}
Overall Average: {analysis.get('overall_average', 0):.3f}
Status: {analysis.get('performance_status', 'unknown')}
"""
        return report.strip()