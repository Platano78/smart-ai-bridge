using UnityEngine;

public class SpecificTestClass : MonoBehaviour 
{
    public float uniqueVariable = 42.0f;
    private string specificMethod = "TEST_PATTERN_12345";
    
    void UniqueMethodName() 
    {
        Debug.Log("This is line 10 with specific content");
        transform.position = new Vector3(uniqueVariable, 0, 0);
        // This comment contains UNIQUE_IDENTIFIER_67890
    }
}