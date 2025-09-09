using UnityEngine;
using System.Collections;

public class EnemyAI : MonoBehaviour
{
    // SPECIFIC IDENTIFIERS FOR TESTING
    public float detectionRange = 10.0f;
    public float attackDamage = 25.0f;
    private bool isPlayerInRange = false;
    
    // This method has a specific bug - line 12
    void Update() 
    {
        CheckPlayerDistance();
        if (isPlayerInRange) {
            // BUG: This should be AttackPlayer() not AttackEnemy()
            AttackEnemy(); // Line 17 - SPECIFIC BUG TO DETECT
        }
    }
    
    void CheckPlayerDistance() 
    {
        // SPECIFIC PATTERN: Using Vector3.Distance (Unity-specific)
        GameObject player = GameObject.FindGameObjectWithTag("Player");
        if (player != null) {
            float distance = Vector3.Distance(transform.position, player.transform.position);
            isPlayerInRange = distance < detectionRange;
        }
    }
    
    // SPECIFIC METHOD NAME TO IDENTIFY
    void AttackEnemy() 
    {
        Debug.Log("Enemy attacking with damage: " + attackDamage);
        // SPECIFIC IDENTIFIER: UNIQUE_TEST_PATTERN_987654
    }
}