// (つ◉益◉)つ BUG-HUNT: SPECIFIC ANALYSIS VALIDATION TEST
// RED PHASE TEST: Validates DeepSeek identifies specific code elements vs generic advice
// MISSION: This test MUST FAIL if DeepSeek defaults to generic programming patterns

const fs = require('fs');
const path = require('path');

class SpecificAnalysisTest {
  constructor() {
    this.testDir = path.join(__dirname, 'test_data');
    this.analysisTargets = [];
  }

  async setup() {
    if (!fs.existsSync(this.testDir)) {
      fs.mkdirSync(this.testDir, { recursive: true });
    }

    // Create multiple test files with VERY SPECIFIC patterns that should trigger specific analysis
    await this.createUnityControllerTest();
    await this.createDataStructureTest();
    await this.createNetworkingTest();
  }

  async createUnityControllerTest() {
    const controllerFile = path.join(this.testDir, 'PlayerController_BugHunt.cs');
    const content = `using UnityEngine;

public class PlayerController_BugHunt : MonoBehaviour
{
    [Header("Movement Settings")]
    public float moveSpeed = 5.0f;
    public float jumpForce = 10.0f;
    
    private Rigidbody rb;
    private bool isGrounded = false;
    
    // Line 12: Specific Unity lifecycle method
    void Start()
    {
        rb = GetComponent<Rigidbody>();
        if (rb == null)
        {
            Debug.LogError("MISSING_RIGIDBODY_COMPONENT_ERROR");
        }
    }
    
    // Line 21: Specific input handling pattern
    void Update()
    {
        float horizontalInput = Input.GetAxis("Horizontal");
        float verticalInput = Input.GetAxis("Vertical");
        
        Vector3 movement = new Vector3(horizontalInput, 0, verticalInput) * moveSpeed;
        rb.velocity = new Vector3(movement.x, rb.velocity.y, movement.z);
        
        // Line 29: Specific jump logic with ground check
        if (Input.GetKeyDown(KeyCode.Space) && isGrounded)
        {
            rb.AddForce(Vector3.up * jumpForce, ForceMode.Impulse);
            isGrounded = false;
        }
    }
    
    // Line 36: Specific collision detection
    private void OnCollisionEnter(Collision collision)
    {
        if (collision.gameObject.CompareTag("Ground"))
        {
            isGrounded = true;
        }
    }
    
    // Line 44: Specific method with parameters
    public void ApplyDamage(float damageAmount, Vector3 knockbackDirection)
    {
        Debug.Log($"Player received {damageAmount} damage from {knockbackDirection}");
        rb.AddForce(knockbackDirection * 5f, ForceMode.Impulse);
    }
}`;

    fs.writeFileSync(controllerFile, content, 'utf8');
    
    this.analysisTargets.push({
      file: controllerFile,
      expectedSpecifics: [
        'PlayerController_BugHunt class definition',
        'moveSpeed and jumpForce field declarations on lines 6-7',
        'Start() method initialization on line 13',
        'MISSING_RIGIDBODY_COMPONENT_ERROR log on line 17',
        'Update() input handling on line 23',
        'Vector3 movement calculation on line 26', 
        'Jump logic with isGrounded check on line 29',
        'OnCollisionEnter collision detection on line 36',
        'CompareTag("Ground") check on line 38',
        'ApplyDamage method with specific parameters on line 44'
      ],
      genericRedFlags: [
        'Use Vector3.Distance',
        'Consider object pooling',
        'Make variables public',
        'Add null checks',
        'Unity best practices'
      ]
    });
  }

  async createDataStructureTest() {
    const dataFile = path.join(this.testDir, 'InventorySystem_BugHunt.cs');
    const content = `using System;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
public class InventoryItem_BugHunt
{
    public string itemId;
    public string itemName;
    public int quantity;
    public float weight;
    
    public InventoryItem_BugHunt(string id, string name, int qty, float w)
    {
        itemId = id;
        itemName = name;
        quantity = qty;
        weight = w;
    }
}

public class InventorySystem_BugHunt : MonoBehaviour
{
    [SerializeField] private List<InventoryItem_BugHunt> items = new List<InventoryItem_BugHunt>();
    [SerializeField] private float maxWeight = 100.0f;
    
    // Line 26: Specific property with custom logic
    public float CurrentWeight
    {
        get
        {
            float totalWeight = 0f;
            foreach (var item in items)
            {
                totalWeight += item.weight * item.quantity;
            }
            return totalWeight;
        }
    }
    
    // Line 38: Specific method with complex logic
    public bool AddItem(string itemId, string itemName, int quantity, float weight)
    {
        if (CurrentWeight + (weight * quantity) > maxWeight)
        {
            Debug.LogWarning($"Cannot add {itemName} - would exceed weight limit");
            return false;
        }
        
        var existingItem = items.Find(i => i.itemId == itemId);
        if (existingItem != null)
        {
            existingItem.quantity += quantity;
            Debug.Log($"Added {quantity} more {itemName} (total: {existingItem.quantity})");
        }
        else
        {
            items.Add(new InventoryItem_BugHunt(itemId, itemName, quantity, weight));
            Debug.Log($"Added new item: {itemName} x{quantity}");
        }
        
        return true;
    }
    
    // Line 58: Specific removal logic
    public bool RemoveItem(string itemId, int quantity)
    {
        var item = items.Find(i => i.itemId == itemId);
        if (item == null)
        {
            Debug.LogError($"Item with ID {itemId} not found in inventory");
            return false;
        }
        
        if (item.quantity < quantity)
        {
            Debug.LogWarning($"Not enough {item.itemName} to remove {quantity}");
            return false;
        }
        
        item.quantity -= quantity;
        if (item.quantity <= 0)
        {
            items.Remove(item);
            Debug.Log($"Removed all {item.itemName} from inventory");
        }
        
        return true;
    }
}`;

    fs.writeFileSync(dataFile, content, 'utf8');
    
    this.analysisTargets.push({
      file: dataFile,
      expectedSpecifics: [
        'InventoryItem_BugHunt class with Serializable attribute',
        'Constructor with parameters id, name, qty, w on line 13',
        'InventorySystem_BugHunt with List<InventoryItem_BugHunt> field',
        'CurrentWeight property with foreach loop on line 26',
        'AddItem method with weight limit check on line 38',
        'Find method with lambda expression on line 45',
        'Debug.LogWarning with weight limit message on line 42',
        'RemoveItem method with quantity validation on line 58',
        'items.Remove(item) call when quantity reaches zero'
      ],
      genericRedFlags: [
        'Use dictionaries for performance',
        'Consider SOLID principles',
        'Add error handling',
        'Use events for notifications'
      ]
    });
  }

  async createNetworkingTest() {
    const networkFile = path.join(this.testDir, 'NetworkManager_BugHunt.cs');
    const content = `using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

public class NetworkManager_BugHunt : MonoBehaviour
{
    [SerializeField] private string serverUrl = "https://api.bughunt.example.com";
    [SerializeField] private float requestTimeout = 30.0f;
    
    // Line 11: Specific event declaration
    public static event Action<string> OnDataReceived;
    public static event Action<string> OnErrorOccurred;
    
    // Line 15: Specific async method pattern
    public IEnumerator SendPlayerData(int playerId, Vector3 position, float health)
    {
        string endpoint = $"{serverUrl}/players/{playerId}/update";
        string jsonData = $"{{\"position\":[{position.x},{position.y},{position.z}],\"health\":{health}}}";
        
        using (UnityWebRequest request = UnityWebRequest.Post(endpoint, jsonData, "application/json"))
        {
            request.timeout = (int)requestTimeout;
            request.SetRequestHeader("Content-Type", "application/json");
            
            // Line 24: Specific yield pattern
            yield return request.SendWebRequest();
            
            if (request.result == UnityWebRequest.Result.Success)
            {
                Debug.Log($"Successfully sent player data for ID {playerId}");
                OnDataReceived?.Invoke(request.downloadHandler.text);
            }
            else
            {
                string errorMessage = $"Network error for player {playerId}: {request.error}";
                Debug.LogError(errorMessage);
                OnErrorOccurred?.Invoke(errorMessage);
            }
        }
    }
    
    // Line 37: Specific data fetching method
    public IEnumerator GetServerStatus()
    {
        string statusEndpoint = $"{serverUrl}/status";
        
        using (UnityWebRequest request = UnityWebRequest.Get(statusEndpoint))
        {
            request.timeout = 10;
            yield return request.SendWebRequest();
            
            if (request.result == UnityWebRequest.Result.Success)
            {
                Debug.Log("Server status: " + request.downloadHandler.text);
            }
            else
            {
                Debug.LogWarning("Failed to get server status: " + request.error);
                StartCoroutine(RetryServerStatus(3));
            }
        }
    }
    
    // Line 53: Specific retry mechanism
    private IEnumerator RetryServerStatus(int maxRetries)
    {
        for (int i = 0; i < maxRetries; i++)
        {
            yield return new WaitForSeconds(5.0f);
            Debug.Log($"Retrying server status check (attempt {i + 1}/{maxRetries})");
            yield return GetServerStatus();
        }
    }
}`;

    fs.writeFileSync(networkFile, content, 'utf8');
    
    this.analysisTargets.push({
      file: networkFile,
      expectedSpecifics: [
        'NetworkManager_BugHunt class definition',
        'Event declarations OnDataReceived and OnErrorOccurred on line 11-12',
        'SendPlayerData coroutine with specific parameters on line 15',
        'JSON string interpolation on line 18',
        'UnityWebRequest.Post with endpoint and jsonData on line 20',
        'request.timeout assignment on line 22',
        'yield return request.SendWebRequest() on line 24',
        'UnityWebRequest.Result.Success check on line 26',
        'OnDataReceived?.Invoke pattern on line 29',
        'GetServerStatus method on line 37',
        'RetryServerStatus with maxRetries parameter on line 53',
        'WaitForSeconds(5.0f) delay on line 57'
      ],
      genericRedFlags: [
        'Use async/await instead',
        'Consider REST best practices',
        'Add authentication',
        'Use JSON serialization library'
      ]
    });
  }

  async testSpecificAnalysis(analysisResponse, targetIndex = 0) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: TESTING SPECIFIC ANALYSIS CAPABILITY...');
    
    if (targetIndex >= this.analysisTargets.length) {
      throw new Error(`Invalid target index: ${targetIndex}`);
    }

    const target = this.analysisTargets[targetIndex];
    const responseText = typeof analysisResponse === 'string' ? analysisResponse : JSON.stringify(analysisResponse);
    
    console.log(`🎯 Testing analysis of: ${path.basename(target.file)}`);
    
    // Test 1: Check for specific code elements
    let specificMatches = 0;
    const missedSpecifics = [];
    
    for (const specific of target.expectedSpecifics) {
      const found = this.checkForSpecificPattern(responseText, specific);
      if (found) {
        specificMatches++;
        console.log(`   ✅ Found: ${specific}`);
      } else {
        missedSpecifics.push(specific);
        console.log(`   ❌ Missing: ${specific}`);
      }
    }

    // Test 2: Check for generic response patterns (red flags)
    let genericFlags = 0;
    const foundGeneric = [];
    
    for (const generic of target.genericRedFlags) {
      if (responseText.toLowerCase().includes(generic.toLowerCase())) {
        genericFlags++;
        foundGeneric.push(generic);
        console.log(`   🚩 Generic pattern found: ${generic}`);
      }
    }

    // Calculate specificity score
    const specificityScore = (specificMatches / target.expectedSpecifics.length) * 100;
    const genericityScore = (genericFlags / target.genericRedFlags.length) * 100;
    
    console.log(`\n📊 ANALYSIS RESULTS for ${path.basename(target.file)}:`);
    console.log(`   Specificity Score: ${specificityScore.toFixed(1)}% (${specificMatches}/${target.expectedSpecifics.length})`);
    console.log(`   Genericity Score: ${genericityScore.toFixed(1)}% (${genericFlags}/${target.genericRedFlags.length})`);
    
    // FAILURE CONDITIONS (expected in RED phase)
    let analysisQuality = 'UNKNOWN';
    if (specificityScore < 30) {
      analysisQuality = 'FAILED_SPECIFIC_ANALYSIS';
      console.log('   ❌ CRITICAL: Low specificity indicates content analysis failure');
    } else if (genericityScore > 50) {
      analysisQuality = 'GENERIC_RESPONSE_DETECTED';
      console.log('   ⚠️  WARNING: High genericity indicates generic programming advice');
    } else if (specificityScore > 70) {
      analysisQuality = 'GOOD_SPECIFIC_ANALYSIS';
      console.log('   ✅ SUCCESS: Good specific analysis detected');
    }

    return {
      file: target.file,
      specificityScore,
      genericityScore,
      specificMatches,
      missedSpecifics,
      genericFlags,
      foundGeneric,
      analysisQuality,
      overallAssessment: specificityScore > 50 && genericityScore < 50 ? 'PASS' : 'FAIL'
    };
  }

  checkForSpecificPattern(text, pattern) {
    // Extract key elements from the pattern description
    const lowerText = text.toLowerCase();
    const lowerPattern = pattern.toLowerCase();
    
    // Look for class names, method names, variable names, etc.
    const keywords = pattern.match(/\w+/g) || [];
    
    // Check if most keywords from the pattern are found
    let matches = 0;
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matches++;
      }
    }
    
    // Return true if most keywords are found
    return matches >= Math.ceil(keywords.length * 0.6);
  }

  async runAllTests(analysisResponses) {
    console.log('\n(つ◉益◉)つ BUG-HUNT: RUNNING COMPREHENSIVE SPECIFIC ANALYSIS TESTS...');
    
    const results = [];
    
    for (let i = 0; i < this.analysisTargets.length; i++) {
      const response = analysisResponses[i] || analysisResponses[0]; // Use first response if only one provided
      const result = await this.testSpecificAnalysis(response, i);
      results.push(result);
    }
    
    // Overall assessment
    const totalSpecificity = results.reduce((sum, r) => sum + r.specificityScore, 0) / results.length;
    const totalGenericity = results.reduce((sum, r) => sum + r.genericityScore, 0) / results.length;
    const passCount = results.filter(r => r.overallAssessment === 'PASS').length;
    
    console.log('\n🏁 OVERALL TEST RESULTS:');
    console.log(`   Average Specificity: ${totalSpecificity.toFixed(1)}%`);
    console.log(`   Average Genericity: ${totalGenericity.toFixed(1)}%`);
    console.log(`   Tests Passed: ${passCount}/${results.length}`);
    
    const overallStatus = passCount >= results.length * 0.7 ? 'CONTENT_ANALYSIS_WORKING' : 'CONTENT_ANALYSIS_FAILED';
    console.log(`   Overall Status: ${overallStatus}`);
    
    return {
      results,
      averageSpecificity: totalSpecificity,
      averageGenericity: totalGenericity,
      passCount,
      totalTests: results.length,
      overallStatus
    };
  }

  listTestFiles() {
    console.log('\n📁 GENERATED TEST FILES:');
    this.analysisTargets.forEach((target, index) => {
      console.log(`   ${index + 1}. ${target.file}`);
      console.log(`      Expected specifics: ${target.expectedSpecifics.length}`);
      console.log(`      Generic red flags: ${target.genericRedFlags.length}`);
    });
  }

  cleanup() {
    for (const target of this.analysisTargets) {
      if (fs.existsSync(target.file)) {
        fs.unlinkSync(target.file);
      }
    }
    if (fs.existsSync(this.testDir)) {
      fs.rmdirSync(this.testDir);
    }
    console.log('🧹 Cleaned up all test files');
  }
}

// EXECUTION
async function runSpecificAnalysisTest() {
  console.log('(つ◉益◉)つ BUG-HUNT: SPECIFIC ANALYSIS TEST INITIALIZATION...');
  
  const test = new SpecificAnalysisTest();
  
  try {
    await test.setup();
    test.listTestFiles();
    
    console.log('\n⚠️  TO COMPLETE THIS TEST:');
    console.log('   1. Run analyze_files on each generated test file');
    console.log('   2. Collect the responses in an array');
    console.log('   3. Call test.runAllTests(responses) to validate specificity');
    console.log('   4. Check if responses contain specific code elements vs generic advice');
    
    return test;
  } catch (error) {
    console.error(`❌ TEST SETUP FAILED: ${error.message}`);
    throw error;
  }
}

if (require.main === module) {
  runSpecificAnalysisTest()
    .then(test => {
      console.log('\n(つ◉益◉)つ BUG-HUNT: SPECIFIC ANALYSIS TESTS READY');
      console.log('Use the generated test files to validate DeepSeek analysis specificity!');
    })
    .catch(error => {
      console.error('💥 CRITICAL TEST FAILURE:', error);
      process.exit(1);
    });
}

module.exports = { SpecificAnalysisTest, runSpecificAnalysisTest };