from models.denseNet import denseNet
from dataHelpers import fromCsv, pairsFromCsvFiles
import tensorflowjs as tfjs
import numpy as np

PROFILE_TASTE_BUCKETS_PATH = "../resources/data/profile/taste/"
PROFILE_ENCODED_ARTISTS_PATH = "../resources/data/profile/encodedArtists/"
RYM_TASTE_FILE = "../resources/data/profile/taste/rym.csv"
MODEL_SAVE_PATH = "../resources/models/taste"


def main():
    (
        trainFeatures,
        trainLabels,
        validationFeatures,
        validationLabels,
        testFeatures,
        testLabels,
    ) = pairsFromCsvFiles(
        PROFILE_ENCODED_ARTISTS_PATH,
        PROFILE_TASTE_BUCKETS_PATH,
        15,
        15,
        skipHeader=0,
        labelBuckets=['2', '3', '4'],
    )
    rymTaste, empty, empty = fromCsv(
        RYM_TASTE_FILE,
        0,
        0,
        skipHeader=0,
    )
    trainLabelsTransformed = []
    validationLabelsTransformed = []
    for user in trainLabels:
        trainLabelsTransformed.append(user - rymTaste)
    for user in validationLabels:
        validationLabelsTransformed.append(user - rymTaste)
    trainLabels = np.array(trainLabelsTransformed)
    validationLabels = np.array(validationLabelsTransformed)
    model = denseNet(
        trainFeatures,
        trainLabels,
        validationFeatures,
        validationLabels,
        activation='relu',
        batchSize=1,
        dropoutRate=0,
        epochs=500,
        learningRate=0.00005,
        regularizationRate=0.1,
    )

    tfjs.converters.save_keras_model(
        model,
        MODEL_SAVE_PATH,
    )


if __name__ == "__main__":
    main()