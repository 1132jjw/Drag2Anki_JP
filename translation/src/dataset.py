import torch
from torch.utils.data import Dataset
import pandas as pd
from transformers import AutoTokenizer
from . import config
from datasets import load_dataset
import os

def download_data():
    data_dir = "data"
    os.makedirs(data_dir, exist_ok=True)
    if not os.path.exists(os.path.join(data_dir, "train.csv")):
        print("Downloading dataset...")
        ds = load_dataset("traintogpb/aihub-koja-translation-integrated-large-4.3m")
        train = ds["train"].to_pandas()
        valid = ds["validation"].to_pandas()
        train.to_csv(os.path.join(data_dir, "train.csv"), index=False)
        valid.to_csv(os.path.join(data_dir, "valid.csv"), index=False)
        print("Dataset downloaded.")


class TranslationDataset(Dataset):
    def __init__(self, file_path, tokenizer, nrows=None):
        self.data = pd.read_csv(file_path, nrows=nrows)
        self.tokenizer = tokenizer

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        row = self.data.iloc[idx]
        source_text = row["ja"]
        target_text = row["ko"]

        inputs = self.tokenizer(
            source_text,
            return_tensors="pt",
            max_length=config.MAX_LENGTH,
            padding="max_length",
            truncation=True,
        )
        with self.tokenizer.as_target_tokenizer():
            labels = self.tokenizer(
                target_text,
                return_tensors="pt",
                max_length=config.MAX_LENGTH,
                padding="max_length",
                truncation=True,
            )

        return {
            "input_ids": inputs.input_ids.squeeze(),
            "attention_mask": inputs.attention_mask.squeeze(),
            "labels": labels.input_ids.squeeze(),
        }


def get_dataloaders(tokenizer):
    train_dataset = TranslationDataset(config.TRAIN_DATASET_PATH, tokenizer, nrows=100000)
    valid_dataset = TranslationDataset(config.VALID_DATASET_PATH, tokenizer, nrows=1000)

    train_dataloader = torch.utils.data.DataLoader(
        train_dataset, batch_size=config.BATCH_SIZE, shuffle=True
    )
    valid_dataloader = torch.utils.data.DataLoader(
        valid_dataset, batch_size=config.BATCH_SIZE
    )

    return train_dataloader, valid_dataloader
