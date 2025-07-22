from datasets import load_dataset
from torch.utils.data import Dataset
import pandas as pd
import os


def download_data():
    if not os.path.exists("../data/train.csv"):
        ds = load_dataset("traintogpb/aihub-koja-translation-integrated-large-4.3m")
        train = ds["train"].to_pandas()
        valid = ds["validation"].to_pandas()
        test = ds["test"].to_pandas()
        train.to_csv("../data/train.csv", index=False)
        valid.to_csv("../data/valid.csv", index=False)
        test.to_csv("../data/test.csv", index=False)


def get_data():
    download_data()
    train = pd.read_csv("../data/train.csv")
    valid = pd.read_csv("../data/valid.csv")
    test = pd.read_csv("../data/test.csv")
    return train, valid, test


if __name__ == "__main__":
    train, valid, test = get_data()
