import argparse
from src.train import train
from src.evaluate import evaluate_model

def main(args):
    data_load(args)
    model(args)
    if args.is_train == "train":
        model = train(args)
    predict(args)
    save_log(args)


if __name__ == "__main__":
    args = parse_arg()
    main(args)
