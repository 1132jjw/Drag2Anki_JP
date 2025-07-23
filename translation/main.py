from src.train import train
from src.evaluate import evaluate_model

if __name__ == "__main__":
    # Uncomment the line below to train the model
    # train()

    # Uncomment the line below to evaluate the model
    # Replace 'nllb-finetuned-epoch-3' with the actual path to your saved model checkpoint
    evaluate_model("nllb-finetuned-epoch-3")
