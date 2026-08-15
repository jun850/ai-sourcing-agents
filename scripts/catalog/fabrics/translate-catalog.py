#!/usr/bin/env python3
"""Translate an Atelix catalogue source document with local Argos models."""

import argparse
import json
import os
import re
from pathlib import Path


def install_models():
    import argostranslate.package
    argostranslate.package.update_package_index()
    packages = argostranslate.package.get_available_packages()
    for target in ("ja", "zh"):
        package = next((item for item in packages if item.from_code == "en" and item.to_code == target), None)
        if package is None:
            raise RuntimeError(f"No Argos en->{target} package is available")
        argostranslate.package.install_from_path(package.download())


def translator(target):
    import argostranslate.translate
    installed = argostranslate.translate.get_installed_languages()
    source = next((lang for lang in installed if lang.code == "en"), None)
    destination = next((lang for lang in installed if lang.code == target), None)
    if source is None or destination is None:
        raise RuntimeError(f"Argos en->{target} model is not installed")
    return source.get_translation(destination)


def protect_text(text):
    return text, []


def restore_text(result, tokens):
    result = result.strip()
    for index, value in enumerate(tokens):
        result = result.replace(f"ZXQKEEP{index}QXZ", value).replace(f"ZXQ KEEP {index} QXZ", value)
    return re.sub(r"\s+", " ", result).strip()


def package_engine(engine):
    import ctranslate2
    while hasattr(engine, "underlying"):
        engine = engine.underlying
    if not hasattr(engine, "pkg"):
        raise RuntimeError("Direct Argos package translation is required")
    if engine.translator is None:
        engine.translator = ctranslate2.Translator(str(engine.pkg.package_path / "model"), device="cpu", intra_threads=int(os.getenv("ATELIX_TRANSLATION_THREADS", "5")))
    return engine


def translate_batch(engine, texts):
    engine = package_engine(engine)
    prepared = [protect_text(text) for text in texts]
    segments, owners = [], []
    for owner, (safe, _) in enumerate(prepared):
        parts = engine.sentencizer.split_sentences(safe) or [safe]
        for part in parts:
            if part.strip():
                segments.append(part)
                owners.append(owner)
    encoded = [engine.pkg.tokenizer.encode(segment) for segment in segments]
    prefix = [[engine.pkg.target_prefix]] * len(encoded) if engine.pkg.target_prefix else None
    results = engine.translator.translate_batch(encoded, target_prefix=prefix, replace_unknowns=True, max_batch_size=4096, batch_type="tokens", beam_size=1, num_hypotheses=1)
    grouped = [[] for _ in texts]
    for owner, result in zip(owners, results):
        value = engine.pkg.tokenizer.decode(result.hypotheses[0]).strip()
        if engine.pkg.target_prefix and value.startswith(engine.pkg.target_prefix):
            value = value[len(engine.pkg.target_prefix):].lstrip()
        grouped[owner].append(value)
    return [restore_text(" ".join(parts), prepared[index][1]) for index, parts in enumerate(grouped)]


def iter_localizable(document):
    for section in ("products", "suppliers"):
        for value in document.get(section, {}).values():
            yield value
    for product_faqs in document.get("faqs", {}).values():
        for value in product_faqs.values():
            yield value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source")
    parser.add_argument("--output")
    parser.add_argument("--cache")
    parser.add_argument("--install-models", action="store_true")
    parser.add_argument("--locale", choices=("ja", "zh"))
    args = parser.parse_args()
    if args.install_models:
        install_models()
        if not args.source:
            return
    if not args.source or not args.output:
        parser.error("--source and --output are required")
    source_path, output_path = Path(args.source), Path(args.output)
    document = json.loads(source_path.read_text())
    output = {"version": 1, "source_generated_at": document.get("generated_at"), "products": document.get("products", {}), "suppliers": document.get("suppliers", {}), "faqs": document.get("faqs", {})}
    cache_path = Path(args.cache) if args.cache else output_path.with_suffix(".cache.json")
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    locales = (args.locale,) if args.locale else ("ja", "zh")
    engines = {locale: translator(locale) for locale in locales}
    values = list(iter_localizable(output)); total = len(values) * 2
    for locale, engine in engines.items():
        missing = []
        for value in values:
            for text in value.get("en", {}).values():
                key = f"{locale}\0{text}"
                if key not in cache and text not in missing:
                    missing.append(text)
        for offset in range(0, len(missing), 128):
            texts = missing[offset:offset + 128]
            translated = translate_batch(engine, texts)
            cache.update({f"{locale}\0{text}": result for text, result in zip(texts, translated)})
            cache_path.write_text(json.dumps(cache, ensure_ascii=False))
            print(f"{locale}: translated {min(offset + len(texts), len(missing))}/{len(missing)} unique texts", flush=True)
    completed = 0
    for value in values:
        english = value.get("en", {})
        for locale in engines:
            value[locale] = {field: cache[f"{locale}\0{text}"] for field, text in english.items()}
            completed += 1
    cache_path.write_text(json.dumps(cache, ensure_ascii=False))
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output_path), "localized_entities": len(values), "cache_entries": len(cache)}))


if __name__ == "__main__":
    main()
