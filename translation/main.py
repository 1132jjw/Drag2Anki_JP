import argparse
from src.config import parse_arg
from src.dataset import get_dataloaders
from src.model import get_model_and_tokenizer
from src.evaluate import get_score

def main(args):
    model, tokenizer = get_model_and_tokenizer(args)
    
    # 미리 data tokenize
    # train, valid, test dataset
    dataloaders = get_dataloaders(args, tokenizer)
    
    if args.is_train == "train":
        model = train(args, dataloaders, model)
    score = get_score(args, dataloaders, model, tokenizer)


if __name__ == "__main__":
    args = parse_arg()
    main(args)
