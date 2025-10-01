using UnityEngine;

public class PlayerController3D : MonoBehaviour
{
    private Rigidbody rb;
    private Vector3 currentVelocity;
    private Vector3 targetVelocity;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
    }

    void HandleVerticalMovement()
    {
        if (Input.GetKey(KeyCode.Space))
        {
            float t = 10.0f;
            Vector3 lerpedVelocity = Vector3.Lerp(currentVelocity, targetVelocity, t);
            rb.velocity = new Vector3(rb.velocity.x, lerpedVelocity.y, rb.velocity.z);
            rb.AddForce(Vector3.down * 5f, ForceMode.Acceleration);
        }
    }
}
