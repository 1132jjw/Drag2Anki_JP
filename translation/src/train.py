import torch
import torch.optim as optim
from tqdm import tqdm
from . import config
from .model import get_model_and_tokenizer
from .dataset import get_dataloaders


def train():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, tokenizer = get_model_and_tokenizer()

    download_data()
    train_dataloader, valid_dataloader = get_dataloaders(tokenizer)

    optimizer = optim.AdamW(model.parameters(), lr=config.LEARNING_RATE)

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

        # Save model checkpoint
        model.save_pretrained(f"nllb-finetuned-epoch-{epoch+1}")
        tokenizer.save_pretrained(f"nllb-finetuned-epoch-{epoch+1}")


if __name__ == "__main__":
    train()
