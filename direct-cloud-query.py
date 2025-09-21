#!/usr/bin/env python3
"""
Direct Cloud API Query Utility
Allows direct queries to NVIDIA DeepSeek V3.1 and other cloud APIs
"""

import os
import json
import requests
from openai import OpenAI

class CloudAPIClient:
    def __init__(self):
        self.nvidia_api_key = os.getenv('NVIDIA_API_KEY')
        self.deepseek_api_key = os.getenv('DEEPSEEK_API_KEY')

        # NVIDIA Client
        if self.nvidia_api_key:
            self.nvidia_client = OpenAI(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=self.nvidia_api_key
            )

        print(f"🔑 NVIDIA API Key: {'✅ SET' if self.nvidia_api_key else '❌ NOT SET'}")
        print(f"🔑 DeepSeek API Key: {'✅ SET' if self.deepseek_api_key else '❌ NOT SET'}")

    def query_nvidia_deepseek(self, prompt, thinking=True, max_tokens=1024):
        """Query NVIDIA DeepSeek V3.1 with thinking mode"""
        if not self.nvidia_api_key:
            return {"error": "NVIDIA API key not set"}

        try:
            print(f"🚀 Querying NVIDIA DeepSeek V3.1 (thinking={thinking})...")

            extra_body = {"chat_template_kwargs": {"thinking": thinking}} if thinking else {}

            completion = self.nvidia_client.chat.completions.create(
                model="deepseek-ai/deepseek-v3.1",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                top_p=0.7,
                max_tokens=max_tokens,
                extra_body=extra_body,
                stream=False
            )

            response = completion.choices[0].message.content
            reasoning = getattr(completion.choices[0].message, 'reasoning_content', None)

            return {
                "success": True,
                "response": response,
                "reasoning": reasoning,
                "model": "deepseek-ai/deepseek-v3.1",
                "endpoint": "NVIDIA",
                "thinking_mode": thinking
            }

        except Exception as e:
            return {"error": f"NVIDIA DeepSeek query failed: {str(e)}"}

    def query_nvidia_deepseek_streaming(self, prompt, thinking=True, max_tokens=1024):
        """Query NVIDIA DeepSeek V3.1 with streaming"""
        if not self.nvidia_api_key:
            print("❌ NVIDIA API key not set")
            return

        try:
            print(f"🚀 Streaming NVIDIA DeepSeek V3.1 (thinking={thinking})...")
            print("💭 Response:")
            print("-" * 50)

            extra_body = {"chat_template_kwargs": {"thinking": thinking}} if thinking else {}

            completion = self.nvidia_client.chat.completions.create(
                model="deepseek-ai/deepseek-v3.1",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                top_p=0.7,
                max_tokens=max_tokens,
                extra_body=extra_body,
                stream=True
            )

            for chunk in completion:
                # Handle reasoning content (thinking mode)
                reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
                if reasoning:
                    print(f"🧠 {reasoning}", end="")

                # Handle main response content
                if chunk.choices[0].delta.content is not None:
                    print(chunk.choices[0].delta.content, end="")

            print("\n" + "-" * 50)
            print("✅ Streaming complete")

        except Exception as e:
            print(f"❌ NVIDIA DeepSeek streaming failed: {str(e)}")

    def query_nvidia_qwen(self, prompt, max_tokens=4096):
        """Query NVIDIA Qwen3 Coder 480B"""
        if not self.nvidia_api_key:
            return {"error": "NVIDIA API key not set"}

        try:
            print(f"🚀 Querying NVIDIA Qwen3 Coder 480B...")

            completion = self.nvidia_client.chat.completions.create(
                model="qwen/qwen3-coder-480b-a35b-instruct",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                top_p=0.8,
                max_tokens=max_tokens,
                stream=False
            )

            response = completion.choices[0].message.content

            return {
                "success": True,
                "response": response,
                "model": "qwen/qwen3-coder-480b-a35b-instruct",
                "endpoint": "NVIDIA",
                "specialization": "coding"
            }

        except Exception as e:
            return {"error": f"NVIDIA Qwen query failed: {str(e)}"}

    def query_nvidia_qwen_streaming(self, prompt, max_tokens=4096):
        """Query NVIDIA Qwen3 Coder with streaming"""
        if not self.nvidia_api_key:
            print("❌ NVIDIA API key not set")
            return

        try:
            print(f"🚀 Streaming NVIDIA Qwen3 Coder 480B...")
            print("💭 Response:")
            print("-" * 50)

            completion = self.nvidia_client.chat.completions.create(
                model="qwen/qwen3-coder-480b-a35b-instruct",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                top_p=0.8,
                max_tokens=max_tokens,
                stream=True
            )

            for chunk in completion:
                if chunk.choices[0].delta.content is not None:
                    print(chunk.choices[0].delta.content, end="")

            print("\n" + "-" * 50)
            print("✅ Streaming complete")

        except Exception as e:
            print(f"❌ NVIDIA Qwen streaming failed: {str(e)}")

    def query_deepseek_direct(self, prompt, model="deepseek-chat", max_tokens=1024):
        """Query DeepSeek API directly"""
        if not self.deepseek_api_key:
            return {"error": "DeepSeek API key not set"}

        try:
            print(f"🚀 Querying DeepSeek Direct API ({model})...")

            headers = {
                "Authorization": f"Bearer {self.deepseek_api_key}",
                "Content-Type": "application/json"
            }

            data = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": 0.2
            }

            response = requests.post(
                "https://api.deepseek.com/chat/completions",
                headers=headers,
                json=data,
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()
                return {
                    "success": True,
                    "response": result["choices"][0]["message"]["content"],
                    "model": model,
                    "endpoint": "DeepSeek Direct",
                    "usage": result.get("usage", {})
                }
            else:
                return {"error": f"DeepSeek API error: {response.status_code} - {response.text}"}

        except Exception as e:
            return {"error": f"DeepSeek direct query failed: {str(e)}"}

    def test_all_endpoints(self):
        """Test all available endpoints"""
        test_prompt = "Hello! Please respond with 'API test successful' to confirm connectivity."

        print("🧪 Testing All Cloud API Endpoints")
        print("=" * 60)

        # Test NVIDIA DeepSeek
        print("\n1. NVIDIA DeepSeek V3.1:")
        nvidia_result = self.query_nvidia_deepseek(test_prompt, thinking=False, max_tokens=50)
        if "error" in nvidia_result:
            print(f"❌ {nvidia_result['error']}")
        else:
            print(f"✅ Success: {nvidia_result['response']}")

        # Test NVIDIA Qwen3 Coder
        print("\n2. NVIDIA Qwen3 Coder 480B:")
        qwen_result = self.query_nvidia_qwen(test_prompt, max_tokens=50)
        if "error" in qwen_result:
            print(f"❌ {qwen_result['error']}")
        else:
            print(f"✅ Success: {qwen_result['response']}")

        # Test DeepSeek Direct
        print("\n3. DeepSeek Direct API:")
        deepseek_result = self.query_deepseek_direct(test_prompt, max_tokens=50)
        if "error" in deepseek_result:
            print(f"❌ {deepseek_result['error']}")
        else:
            print(f"✅ Success: {deepseek_result['response']}")

        print("\n" + "=" * 60)
        print("🏁 Endpoint testing complete")

def main():
    """Main function with interactive CLI"""
    client = CloudAPIClient()

    print("\n🌩️ Direct Cloud API Query Utility")
    print("=" * 50)
    print("1. test - Test all endpoints")
    print("2. nvidia <prompt> - Query NVIDIA DeepSeek V3.1")
    print("3. nvidia-stream <prompt> - Stream NVIDIA DeepSeek V3.1")
    print("4. qwen <prompt> - Query NVIDIA Qwen3 Coder 480B")
    print("5. qwen-stream <prompt> - Stream NVIDIA Qwen3 Coder")
    print("6. deepseek <prompt> - Query DeepSeek Direct")
    print("7. help - Show this help")
    print("8. exit - Exit")
    print("=" * 50)

    while True:
        try:
            cmd = input("\n🤖 Enter command: ").strip()

            if cmd == "exit":
                break
            elif cmd == "test":
                client.test_all_endpoints()
            elif cmd.startswith("nvidia-stream "):
                prompt = cmd[14:]
                client.query_nvidia_deepseek_streaming(prompt)
            elif cmd.startswith("nvidia "):
                prompt = cmd[7:]
                result = client.query_nvidia_deepseek(prompt)
                print(json.dumps(result, indent=2))
            elif cmd.startswith("qwen-stream "):
                prompt = cmd[12:]
                client.query_nvidia_qwen_streaming(prompt)
            elif cmd.startswith("qwen "):
                prompt = cmd[5:]
                result = client.query_nvidia_qwen(prompt)
                print(json.dumps(result, indent=2))
            elif cmd.startswith("deepseek "):
                prompt = cmd[9:]
                result = client.query_deepseek_direct(prompt)
                print(json.dumps(result, indent=2))
            elif cmd == "help":
                print("Available commands:")
                print("test, nvidia <prompt>, nvidia-stream <prompt>, qwen <prompt>, qwen-stream <prompt>, deepseek <prompt>, exit")
            else:
                print("❌ Unknown command. Type 'help' for options.")

        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()