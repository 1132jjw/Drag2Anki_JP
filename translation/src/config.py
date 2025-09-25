MODEL_NAME = "facebook/nllb-200-distilled-1.3B"
TRAIN_DATASET_PATH = "data/train.csv"
VALID_DATASET_PATH = "data/valid.csv"
LEARNING_RATE = 2e-5
EPOCHS = 3
BATCH_SIZE = 16
MAX_LENGTH = 128
SRC_LANG = "jpn_Jpan"
TGT_LANG = "kor_Hang"
LORA_R = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.05

import argparse

def parse_arg():
    parser = argparse.ArgumentParser(description='parser')
    
    parser.add_argument("--seed", default=42, type=int, help="seed")
    parser.add_argument("--device", default="cuda", type=str, help="cpu or cuda")
    
    # train, test
    parser.add_argument("--is_train", default="train", choices=["train", "test"], 
                        type=str, help="train or test")
    
    # src, target 언어 설정
    parser.add_argument("--source_lang", default="ja", type=str)
    parser.add_argument("--target_lang", default="ko", type=str)
    
    # 데이터 위치
    parser.add_argument("--data_dir", default="../data", type=str)
    
    # 모델 선택
    parser.add_argument("--model", default="", type=str, help="model")
    
    # 테스트 결과 저장
    parser.add_argument("--test_result_dir", default="./test_result/", type=str)
    
    arg = parser.parse_args()
    
    return arg 