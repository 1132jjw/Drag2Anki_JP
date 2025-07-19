import torch.nn as nn

class KojaModel(nn.Module):
    def __init__(self, vocab_size, d_model, n_heads, n_layers, max_length):
        super(KojaModel, self).__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.pos_embedding = nn.Embedding(max_length, d_model)
        self.encoder = nn.TransformerEncoder(nn.TransformerEncoderLayer(d_model, n_heads), n_layers)
        self.decoder = nn.TransformerDecoder(nn.TransformerDecoderLayer(d_model, n_heads), n_layers)
        self.fc = nn.Linear(d_model, vocab_size)
        
    def forward(self, src, tgt):
        src_mask = self.create_mask(src)
        tgt_mask = self.create_mask(tgt)
        src_embed = self.embedding(src) + self.pos_embedding(src)
        tgt_embed = self.embedding(tgt) + self.pos_embedding(tgt)
        enc_output = self.encoder(src_embed, src_mask)
        dec_output = self.decoder(tgt_embed, enc_output, src_mask, tgt_mask)
        output = self.fc(dec_output)
        return output

