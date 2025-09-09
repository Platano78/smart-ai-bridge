using UnityEngine;
using System.Collections;
using System.Collections.Generic;

public class EnemyAI : MonoBehaviour
{
    [Header("Movement Settings")]
    public float movementSpeed = 3.5f;
    public float rotationSpeed = 90f;
    public float detectionRadius = 8f;
    public float attackRange = 2f;
    
    [Header("Combat Settings")]
    public int maxHealth = 100;
    public int currentHealth;
    public int attackDamage = 25;
    public float attackCooldown = 2f;
    private float lastAttackTime = 0f;
    
    [Header("AI Behavior")]
    public Transform[] patrolPoints;
    public LayerMask playerLayer;
    public LayerMask obstacleLayer;
    
    private Transform playerTransform;
    private Rigidbody enemyRigidbody;
    private Animator enemyAnimator;
    private AudioSource audioSource;
    
    private AIState currentState = AIState.Patrolling;
    private int currentPatrolIndex = 0;
    private Vector3 lastKnownPlayerPosition;
    private bool isPlayerDetected = false;
    
    public enum AIState
    {
        Patrolling,
        Chasing,
        Attacking,
        Searching,
        Dead
    }
    
    void Start()
    {
        InitializeComponents();
        SetupInitialState();
        StartCoroutine(AIDecisionLoop());
    }
    
    void InitializeComponents()
    {
        currentHealth = maxHealth;
        enemyRigidbody = GetComponent<Rigidbody>();
        enemyAnimator = GetComponent<Animator>();
        audioSource = GetComponent<AudioSource>();
        
        if (GameObject.FindGameObjectWithTag("Player") != null)
        {
            playerTransform = GameObject.FindGameObjectWithTag("Player").transform;
        }
        
        if (patrolPoints.Length == 0)
        {
            Debug.LogWarning("No patrol points assigned to " + gameObject.name);
        }
    }
    
    void SetupInitialState()
    {
        currentState = AIState.Patrolling;
        currentPatrolIndex = 0;
        isPlayerDetected = false;
    }
    
    void Update()
    {
        UpdateAnimations();
        CheckPlayerDetection();
        
        switch (currentState)
        {
            case AIState.Patrolling:
                HandlePatrolling();
                break;
            case AIState.Chasing:
                HandleChasing();
                break;
            case AIState.Attacking:
                HandleAttacking();
                break;
            case AIState.Searching:
                HandleSearching();
                break;
            case AIState.Dead:
                // Do nothing when dead
                break;
        }
    }
    
    IEnumerator AIDecisionLoop()
    {
        while (currentState != AIState.Dead)
        {
            MakeAIDecision();
            yield return new WaitForSeconds(0.1f); // Decision frequency
        }
    }
    
    void MakeAIDecision()
    {
        if (currentHealth <= 0)
        {
            TransitionToState(AIState.Dead);
            return;
        }
        
        float distanceToPlayer = Vector3.Distance(transform.position, playerTransform.position);
        
        // State transition logic
        if (isPlayerDetected)
        {
            if (distanceToPlayer <= attackRange && CanSeePlayer())
            {
                TransitionToState(AIState.Attacking);
            }
            else if (distanceToPlayer <= detectionRadius && CanSeePlayer())
            {
                TransitionToState(AIState.Chasing);
                lastKnownPlayerPosition = playerTransform.position;
            }
            else
            {
                TransitionToState(AIState.Searching);
            }
        }
        else
        {
            TransitionToState(AIState.Patrolling);
        }
    }
    
    void HandlePatrolling()
    {
        if (patrolPoints.Length == 0) return;
        
        Transform targetPoint = patrolPoints[currentPatrolIndex];
        MoveTowards(targetPoint.position);
        
        if (Vector3.Distance(transform.position, targetPoint.position) < 1f)
        {
            currentPatrolIndex = (currentPatrolIndex + 1) % patrolPoints.Length;
        }
    }
    
    void HandleChasing()
    {
        if (playerTransform != null)
        {
            MoveTowards(playerTransform.position);
            lastKnownPlayerPosition = playerTransform.position;
        }
    }
    
    void HandleAttacking()
    {
        // Face the player
        Vector3 directionToPlayer = (playerTransform.position - transform.position).normalized;
        Quaternion lookRotation = Quaternion.LookRotation(directionToPlayer);
        transform.rotation = Quaternion.Slerp(transform.rotation, lookRotation, rotationSpeed * Time.deltaTime);
        
        // Attack if cooldown is over
        if (Time.time - lastAttackTime >= attackCooldown)
        {
            PerformAttack();
            lastAttackTime = Time.time;
        }
    }
    
    void HandleSearching()
    {
        MoveTowards(lastKnownPlayerPosition);
        
        if (Vector3.Distance(transform.position, lastKnownPlayerPosition) < 2f)
        {
            // Search complete, return to patrolling
            TransitionToState(AIState.Patrolling);
        }
    }
    
    void MoveTowards(Vector3 targetPosition)
    {
        Vector3 direction = (targetPosition - transform.position).normalized;
        enemyRigidbody.MovePosition(transform.position + direction * movementSpeed * Time.deltaTime);
        
        // Rotate towards movement direction
        if (direction.magnitude > 0.1f)
        {
            Quaternion lookRotation = Quaternion.LookRotation(direction);
            transform.rotation = Quaternion.Slerp(transform.rotation, lookRotation, rotationSpeed * Time.deltaTime);
        }
    }
    
    bool CanSeePlayer()
    {
        if (playerTransform == null) return false;
        
        Vector3 directionToPlayer = (playerTransform.position - transform.position).normalized;
        RaycastHit hit;
        
        if (Physics.Raycast(transform.position, directionToPlayer, out hit, detectionRadius, playerLayer | obstacleLayer))
        {
            return hit.transform.CompareTag("Player");
        }
        
        return false;
    }
    
    void CheckPlayerDetection()
    {
        if (playerTransform == null) return;
        
        float distanceToPlayer = Vector3.Distance(transform.position, playerTransform.position);
        isPlayerDetected = distanceToPlayer <= detectionRadius && CanSeePlayer();
    }
    
    void PerformAttack()
    {
        enemyAnimator.SetTrigger("Attack");
        audioSource.Play();
        
        // Deal damage to player if in range
        if (Vector3.Distance(transform.position, playerTransform.position) <= attackRange)
        {
            PlayerHealth playerHealth = playerTransform.GetComponent<PlayerHealth>();
            if (playerHealth != null)
            {
                playerHealth.TakeDamage(attackDamage);
            }
        }
    }
    
    void TransitionToState(AIState newState)
    {
        if (currentState == newState) return;
        
        // Exit current state
        switch (currentState)
        {
            case AIState.Patrolling:
                // No cleanup needed
                break;
            case AIState.Chasing:
                // No cleanup needed
                break;
            case AIState.Attacking:
                // No cleanup needed
                break;
            case AIState.Searching:
                // No cleanup needed
                break;
        }
        
        // Enter new state
        currentState = newState;
        switch (newState)
        {
            case AIState.Patrolling:
                enemyAnimator.SetBool("IsChasing", false);
                break;
            case AIState.Chasing:
                enemyAnimator.SetBool("IsChasing", true);
                break;
            case AIState.Attacking:
                enemyAnimator.SetBool("IsAttacking", true);
                break;
            case AIState.Searching:
                enemyAnimator.SetBool("IsChasing", false);
                break;
            case AIState.Dead:
                enemyAnimator.SetTrigger("Death");
                GetComponent<Collider>().enabled = false;
                enabled = false;
                break;
        }
    }
    
    void UpdateAnimations()
    {
        if (enemyAnimator == null) return;
        
        float speed = enemyRigidbody.velocity.magnitude;
        enemyAnimator.SetFloat("Speed", speed);
        enemyAnimator.SetBool("IsPlayerDetected", isPlayerDetected);
        enemyAnimator.SetFloat("HealthPercentage", (float)currentHealth / maxHealth);
    }
    
    public void TakeDamage(int damage)
    {
        if (currentState == AIState.Dead) return;
        
        currentHealth -= damage;
        enemyAnimator.SetTrigger("TakeDamage");
        
        if (currentHealth <= 0)
        {
            currentHealth = 0;
            TransitionToState(AIState.Dead);
        }
        else
        {
            // Become aggressive when damaged
            isPlayerDetected = true;
            TransitionToState(AIState.Chasing);
        }
    }
    
    void OnDrawGizmosSelected()
    {
        // Draw detection radius
        Gizmos.color = Color.yellow;
        Gizmos.DrawWireSphere(transform.position, detectionRadius);
        
        // Draw attack range
        Gizmos.color = Color.red;
        Gizmos.DrawWireSphere(transform.position, attackRange);
        
        // Draw patrol points
        if (patrolPoints != null)
        {
            Gizmos.color = Color.blue;
            for (int i = 0; i < patrolPoints.Length; i++)
            {
                if (patrolPoints[i] != null)
                {
                    Gizmos.DrawWireSphere(patrolPoints[i].position, 0.5f);
                    
                    // Draw path between points
                    if (i < patrolPoints.Length - 1 && patrolPoints[i + 1] != null)
                    {
                        Gizmos.DrawLine(patrolPoints[i].position, patrolPoints[i + 1].position);
                    }
                    else if (i == patrolPoints.Length - 1 && patrolPoints[0] != null)
                    {
                        Gizmos.DrawLine(patrolPoints[i].position, patrolPoints[0].position);
                    }
                }
            }
        }
        
        // Draw line to player if detected
        if (isPlayerDetected && playerTransform != null)
        {
            Gizmos.color = Color.green;
            Gizmos.DrawLine(transform.position, playerTransform.position);
        }
    }
}