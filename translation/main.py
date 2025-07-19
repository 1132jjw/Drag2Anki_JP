from src.train import train
from src.model import KojaModel
from datas.dataset import KojaDataset
from transformers import AutoTokenizer
import torch.nn as nn
import torch.optim as optim
from datas.dataset import get_data

def main():
    tokenizer = AutoTokenizer.from_pretrained("t5-base")
    model = KojaModel(vocab_size=len(tokenizer.vocab), d_model=512, n_heads=8, n_layers=6, max_length=128)
    ds = get_data()
    dataloader = KojaDataset(ds, tokenizer, max_length=128)
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    loss_fn = nn.CrossEntropyLoss()
    train(model, dataloader, optimizer, loss_fn, epochs=10)

if __name__ == "__main__":
    main()