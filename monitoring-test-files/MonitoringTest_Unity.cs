using UnityEngine;

public class MonitoringTest_Unity : MonoBehaviour
{
    [SerializeField] private float monitoringValue = 42.0f;
    private bool isMonitoring = true;
    
    void Start()
    {
        Debug.Log("Monitoring test started with value: " + monitoringValue);
        InitializeMonitoringSystem();
    }
    
    private void InitializeMonitoringSystem()
    {
        if (isMonitoring)
        {
            InvokeRepeating("MonitorPerformance", 1.0f, 5.0f);
        }
    }
    
    private void MonitorPerformance()
    {
        float currentFPS = 1.0f / Time.deltaTime;
        Debug.Log($"Performance Monitor: FPS = {currentFPS:F1}");
    }
}