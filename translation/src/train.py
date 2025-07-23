import torch
import torch.optim as optim
from tqdm import tqdm
from . import config
from .model import get_model_and_tokenizer
from .dataset import get_dataloaders, download_data
import os
from datetime import datetime


def train():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, tokenizer = get_model_and_tokenizer()

    download_data()
    train_dataloader, valid_dataloader = get_dataloaders(tokenizer)

    optimizer = optim.AdamW(model.parameters(), lr=config.LEARNING_RATE)

    # Create a unique save directory for this training run
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_save_dir = f"nllb-finetuned-{timestamp}"
    os.makedirs(run_save_dir, exist_ok=True)

    for epoch in range(config.EPOCHS):
        model.train()
        total_loss = 0
        for batch in tqdm(train_dataloader, desc=f"Epoch {epoch + 1}/{config.EPOCHS} [Training]"):
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            outputs = model(
                input_ids=input_ids, attention_mask=attention_mask, labels=labels
            )
            loss = outputs.loss
            loss.backward()
            optimizer.step()

            total_loss += loss.item()

        avg_train_loss = total_loss / len(train_dataloader)
        print(f"Epoch {epoch + 1}/{config.EPOCHS}, Train Loss: {avg_train_loss:.4f}")

        model.eval()
        total_eval_loss = 0
        for batch in tqdm(valid_dataloader, desc=f"Epoch {epoch + 1}/{config.EPOCHS} [Validation]"):
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            with torch.no_grad():
                outputs = model(
                    input_ids=input_ids, attention_mask=attention_mask, labels=labels
                )
                loss = outputs.loss

            total_eval_loss += loss.item()

        avg_eval_loss = total_eval_loss / len(valid_dataloader)
        print(f"Epoch {epoch + 1}/{config.EPOCHS}, Validation Loss: {avg_eval_loss:.4f}")

        # Save model checkpoint for each epoch within the unique run directory
        epoch_save_path = os.path.join(run_save_dir, f"epoch-{epoch+1}")
        model.save_pretrained(epoch_save_path)
        tokenizer.save_pretrained(epoch_save_path)
