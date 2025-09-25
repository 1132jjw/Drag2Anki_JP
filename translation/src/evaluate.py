import torch
import evaluate
from tqdm import tqdm
from . import config

def get_score(args, dataloaders, model, tokenizer):
    device = torch.device(args.device)
    model.to(device)
    model.eval()

    test_dataloader = dataloaders['test']

    # Initialize metrics
    bleu = evaluate.load("bleu")
    ter = evaluate.load("ter")
    chrf = evaluate.load("chrf")

    predictions = []
    references = []

    print("Generating translations for evaluation...")
    # NLLB requires forcing the decoder BOS token to the target language code
    forced_bos_token_id = None
    if hasattr(tokenizer, "lang_code_to_id") and getattr(tokenizer, "tgt_lang", None):
        forced_bos_token_id = tokenizer.lang_code_to_id.get(tokenizer.tgt_lang)

    for batch in tqdm(test_dataloader):
        input_ids = batch["input_ids"].to(device)
        attention_mask = batch["attention_mask"].to(device)

        gen_kwargs = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "max_length": config.MAX_LENGTH,
        }
        if forced_bos_token_id is not None:
            gen_kwargs["forced_bos_token_id"] = forced_bos_token_id

        generated = model.generate(**gen_kwargs)
        batch_predictions = tokenizer.batch_decode(generated, skip_special_tokens=True)
        predictions.extend(batch_predictions)

        # Decode references from labels in the batch
        labels = batch["labels"].to(device)
        batch_references = tokenizer.batch_decode(labels, skip_special_tokens=True)
        # Many metrics expect list of list (multiple references per prediction). Wrap each ref in a list
        references.extend([[ref] for ref in batch_references])
        
    print("\nCalculating metrics...")
    bleu_score = bleu.compute(predictions=predictions, references=references)
    ter_score = ter.compute(predictions=predictions, references=references)
    chrf_score = chrf.compute(predictions=predictions, references=references)

    print(f"BLEU: {bleu_score['bleu']:.2f}")
    print(f"TER: {ter_score['score']:.2f}")
    print(f"chrF: {chrf_score['score']:.2f}")
