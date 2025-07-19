import torch
import torch.nn as nn
import torch.optim as optim
from datas.dataset import KojaDataset
from models.model import KojaModel
from transformers import AutoTokenizer

def train(model, dataloader, optimizer, loss_fn, epochs=10):
    for epoch in range(epochs):
        for batch in dataloader:
            optimizer.zero_grad()
            loss = loss_fn(model(batch['input_ids']), batch['labels'])
            loss.backward()
            optimizer.step()
    return model

if __name__ == "__main__":
    model = KojaModel()
    tokenizer = AutoTokenizer.from_pretrained("t5-base")
    ds = get_data()
    dataloader = KojaDataset(ds, tokenizer, max_length=128)
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    loss_fn = nn.CrossEntropyLoss()
    train(model, dataloader, optimizer, loss_fn, epochs=10)