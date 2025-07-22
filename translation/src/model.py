import torch.nn as nn
import openai
import requests
import os
from dotenv import load_dotenv

load_dotenv()


class GPT:
    def __init__(self, model="gpt-4.1-nano-2025-04-14"):
        self.model = model
        self.api_key = os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API 키가 없습니다.")
        self.client = openai.OpenAI(api_key=self.api_key)

    def generate(self, message, temperature=0.7, max_tokens=256):
        client = self.client
        messages = [
            {
                "role": "system",
                "content": ("앞으로 당신은 한국어를 일본어로 번역하는 역할을 합니다. " "번역은 자연스럽고 정확해야 합니다."),
            },
            {"role": "user", "content": f"{message}"},
        ]

        try:
            response = client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"GPT {self.model} 오류 발생: {e}")
            return None


class DeepL:
    def __init__(self):
        self.url = "https://api-free.deepl.com/v2/translate"
        self.auth_key = os.getenv("DEEPL_API_KEY")
        if not self.auth_key:
            raise ValueError("DeepL API 키가 없습니다.")

    def generate(self, message, source_lang="JA", target_lang="KO"):
        params = {
            "auth_key": self.auth_key,  # 여기에 본인의 DeepL API 키를 입력하세요
            "text": message,
            "source_lang": source_lang,
            "target_lang": target_lang,
        }
        try:
            response = requests.post(self.url, data=params, timeout=10)
            response.raise_for_status()
            translation = response.json()["translations"][0]["text"]
            return translation
        except Exception as e:
            print(f"DeepL API 요청 실패: {e}")
            return None


class CustomModel(nn.Module):
    def __init__(self):
        super().__init__()
        pass

    def forward(self, x):
        pass
