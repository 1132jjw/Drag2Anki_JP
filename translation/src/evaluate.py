import sacrebleu


class BLEU_Score:
    def __init__(self):
        pass

    def compute(self, references, hypothesis):
        bleu = sacrebleu.corpus_bleu(hypothesis, references)
        return bleu


class CHRF_Score:
    def __init__(self):
        pass

    def compute(self, references, hypothesis):
        chrf = sacrebleu.corpus_chrf(hypothesis, references)
        return chrf


class TER_Score:
    def __init__(self):
        pass

    def compute(self, references, hypothesis):
        ter = sacrebleu.corpus_ter(hypothesis, references)
        return ter


class BLEURT_Score:
    def __init__(self):
        pass
    
    def compute(self):
        pass
