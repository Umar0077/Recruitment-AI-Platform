"""Exact multi-model V5 ensemble inference logic."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch
from PIL import Image

from app.models.loader import LoadedEnsembleBundle
from app.models.preprocessing import prepare_fer_face_image


@dataclass(frozen=True)
class EnsemblePrediction:
    expression_label: str
    confidence: float
    probabilities: dict[str, float]
    top_predictions: list[tuple[str, float]]


class FacialExpressionEnsembleRunner:
    """Runs deterministic PyTorch inference across the loaded V5 ensemble."""

    def __init__(self, bundle: LoadedEnsembleBundle) -> None:
        self.bundle = bundle

    @torch.inference_mode()
    def predict_cropped_face(self, cropped_face: Image.Image) -> EnsemblePrediction:
        """Predict facial expression probabilities from an already-cropped RGB face image."""
        num_classes = len(self.bundle.class_order)
        face48 = prepare_fer_face_image(cropped_face)
        combined = np.zeros(num_classes, dtype=np.float64)

        for member in self.bundle.members:
            tensor = member.transform(face48).unsqueeze(0).to(self.bundle.device)
            logits = member.model(tensor)
            if tuple(logits.shape) != (1, num_classes):
                raise RuntimeError(
                    f"Model {member.model_name} produced invalid shape {tuple(logits.shape)}; expected (1, {num_classes})."
                )
            if not torch.isfinite(logits).all():
                raise RuntimeError(f"Model {member.model_name} produced non-finite logits.")

            probabilities = torch.softmax(logits.float(), dim=1)
            if member.use_tta:
                flipped_logits = member.model(torch.flip(tensor, dims=[3]))
                if not torch.isfinite(flipped_logits).all():
                    raise RuntimeError(f"Model {member.model_name} produced non-finite TTA logits.")
                flipped_probs = torch.softmax(flipped_logits.float(), dim=1)
                probabilities = (probabilities + flipped_probs) / 2.0

            combined += float(member.weight) * probabilities[0].detach().cpu().numpy()

        calibrated_logits = np.log(np.maximum(combined, 1e-9)) + self.bundle.class_bias
        final_probs = np.exp(calibrated_logits - calibrated_logits.max())
        prob_sum = float(final_probs.sum())
        if not np.isfinite(final_probs).all() or prob_sum <= 0.0:
            raise RuntimeError("Ensemble produced invalid probability distribution.")
        final_probs = final_probs / prob_sum

        sorted_indices = np.argsort(-final_probs)
        top_idx = int(sorted_indices[0])
        prob_map = {
            label: float(final_probs[i])
            for i, label in enumerate(self.bundle.class_order)
        }
        top_three = [
            (self.bundle.class_order[int(i)], float(final_probs[int(i)]))
            for i in sorted_indices[:3]
        ]
        return EnsemblePrediction(
            expression_label=self.bundle.class_order[top_idx],
            confidence=float(final_probs[top_idx]),
            probabilities=prob_map,
            top_predictions=top_three,
        )
