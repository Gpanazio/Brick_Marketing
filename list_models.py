from google import genai
import os
import sys

def list_models():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    for model in client.models.list():
        print(f"Name: {model.name}")

if __name__ == "__main__":
    list_models()
