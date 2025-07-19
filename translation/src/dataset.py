from datasets import load_dataset
from torch.utils.data import Dataset

def get_data():
    ds = load_dataset("traintogpb/aihub-koja-translation-integrated-large-4.3m")
    return ds

class KojaDataset(Dataset):
    def __init__(self, ds, tokenizer, max_length=128):
        self.ds = ds
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.ds)
    
    def __getitem__(self, idx):
        item = self.ds[idx]
        return item
    
        

if __name__ == "__main__":
    ds = get_data()
    print(ds)