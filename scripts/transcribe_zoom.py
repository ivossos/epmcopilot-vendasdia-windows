#!/usr/bin/env python3
"""
Transcreve gravações do Zoom (ou qualquer áudio/vídeo) usando Whisper.

Uso:
    python scripts/transcribe_zoom.py caminho/para/arquivo.mp4
    python scripts/transcribe_zoom.py caminho/para/arquivo.m4a

Requer: pip install openai-whisper
        ffmpeg instalado no sistema (brew install ffmpeg no macOS)
"""

import argparse
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Transcreve áudio/vídeo com Whisper")
    parser.add_argument(
        "arquivo",
        type=str,
        help="Caminho para o arquivo de áudio ou vídeo (mp4, m4a, mp3, wav, etc.)",
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        default=None,
        help="Arquivo de saída para a transcrição (.txt). Se não informado, usa o nome do arquivo + .txt",
    )
    parser.add_argument(
        "-m", "--model",
        type=str,
        default="base",
        choices=["tiny", "base", "small", "medium", "large", "large-v3"],
        help="Modelo Whisper: tiny (mais rápido), base, small, medium, large (mais preciso). Default: base",
    )
    parser.add_argument(
        "-l", "--language",
        type=str,
        default="pt",
        help="Código do idioma (pt, en, es, etc.). Default: pt",
    )
    args = parser.parse_args()

    path = Path(args.arquivo)
    if not path.exists():
        print(f"Erro: arquivo não encontrado: {path}", file=sys.stderr)
        sys.exit(1)

    try:
        import whisper
    except ImportError:
        print(
            "Erro: instale o Whisper com: pip install openai-whisper",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Carregando modelo '{args.model}'...")
    model = whisper.load_model(args.model)

    print(f"Transcrevendo: {path}")
    result = model.transcribe(
        str(path),
        language=args.language,
        fp16=False,  # evita erro em CPU sem GPU
    )

    text = result["text"].strip()
    output_path = Path(args.output) if args.output else path.with_suffix(".txt")
    output_path.write_text(text, encoding="utf-8")

    print(f"\nTranscrição salva em: {output_path}")
    print("\n--- Prévia ---")
    print(text[:500] + ("..." if len(text) > 500 else ""))


if __name__ == "__main__":
    main()
