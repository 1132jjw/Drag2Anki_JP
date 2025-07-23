import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
import evaluate
import pandas as pd
from tqdm import tqdm
from . import config
from .dataset import download_data

def evaluate_model(model_path):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # Ensure test data is available
    download_data()

    # Load the fine-tuned model and tokenizer
    model = AutoModelForSeq2SeqLM.from_pretrained(model_path)
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model.to(device)
    model.eval()

    # Load test data
    test_df = pd.read_csv("data/test.csv")

    # Initialize metrics
    bleu = evaluate.load("bleu")
    ter = evaluate.load("ter")
    chrf = evaluate.load("chrf")

    predictions = []
    references = []

    print("Generating translations for evaluation...")
    for _, row in tqdm(test_df.iterrows(), total=len(test_df)):
        source_text = row["ja"]  # Assuming 'ja' is the source language column
        target_text = row["ko"]  # Assuming 'ko' is the target language column

        inputs = tokenizer(
            source_text,
            return_tensors="pt",
            max_length=config.MAX_LENGTH,
            padding="max_length",
            truncation=True,
        ).to(device)

        with torch.no_grad():
            generated_ids = model.generate(
                inputs.input_ids,
                attention_mask=inputs.attention_mask,
                max_new_tokens=config.MAX_LENGTH,
            )
        translated_text = tokenizer.decode(generated_ids[0], skip_special_tokens=True)

        predictions.append(translated_text)
        references.append([target_text])  # References should be a list of lists for some metrics

    print("\nCalculating metrics...")
    bleu_score = bleu.compute(predictions=predictions, references=references)
    ter_score = ter.compute(predictions=predictions, references=references)
    chrf_score = chrf.compute(predictions=predictions, references=references)

    print(f"BLEU: {bleu_score['bleu']:.2f}")
    print(f"TER: {ter_score['score']:.2f}")
    print(f"chrF: {chrf_score['score']:.2f}")

if __name__ == "__main__":
    # Replace 'nllb-finetuned-epoch-3' with the actual path to your saved model checkpoint
    # For example, if you saved the model after 3 epochs, it would be 'nllb-finetuned-epoch-3'
    model_checkpoint_path = "nllb-finetuned-epoch-3" # <--- 여기에 학습된 모델 경로를 입력하세요
    evaluate_model(model_checkpoint_path)