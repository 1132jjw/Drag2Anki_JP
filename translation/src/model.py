import torch.nn as nn
import openai
import requests
import os
from dotenv import load_dotenv
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, BitsAndBytesConfig
from peft import get_peft_model, LoraConfig, TaskType

from . import config

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

def get_model_and_tokenizer(args):
    # Initialize tokenizer with language codes for NLLB (or similar multilingual models)
    src_lang_code = getattr(config, "SRC_LANG", None)
    tgt_lang_code = getattr(config, "TGT_LANG", None)

    if src_lang_code and tgt_lang_code:
        tokenizer = AutoTokenizer.from_pretrained(
            args.model,
            src_lang=src_lang_code,
            tgt_lang=tgt_lang_code,
        )
        # Ensure attributes exist for evaluate forced_bos_token_id logic
        tokenizer.src_lang = src_lang_code
        tokenizer.tgt_lang = tgt_lang_code
    else:
        tokenizer = AutoTokenizer.from_pretrained(args.model)

    model = AutoModelForSeq2SeqLM.from_pretrained(args.model)
    # quantization_config = BitsAndBytesConfig(load_in_4bit=True)
    # model = AutoModelForSeq2SeqLM.from_pretrained(
    #     config.MODEL_NAME,
    #     quantization_config=quantization_config,
    #     device_map="auto",
    # )
    # tokenizer = AutoTokenizer.from_pretrained(
    #     config.MODEL_NAME, src_lang=config.SRC_LANG, tgt_lang=config.TGT_LANG
    # )

    # lora_config = LoraConfig(
    #     r=config.LORA_R,
    #     lora_alpha=config.LORA_ALPHA,
    #     target_modules=["q_proj", "v_proj"],
    #     lora_dropout=config.LORA_DROPOUT,
    #     bias="none",
    #     task_type=TaskType.SEQ_2_SEQ_LM
    # )

    # model = get_peft_model(model, lora_config)
    # model.print_trainable_parameters()

    return model, tokenizer
