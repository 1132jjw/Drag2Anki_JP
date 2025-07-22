from konlpy.tag import Okt
from fugashi import Tagger


class JA_Tokenizer:
    def __init__(self):
        self.tagger = Tagger()

    def tokenize(self, text):
        tagger = self.tagger
        tokens = [word.surface for word in tagger(text)]
        return tokens


class KO_Tokenizer:
    def __init__(self):
        self.okt = Okt()

    def tokenize(self, text):
        okt = self.okt
        tokens = okt.morphs(text)
        return tokens
