
# Imports
import pandas as pd
import re
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS
from sklearn.decomposition import LatentDirichletAllocation

# Load Data
youtube_transcripts_df = pd.read_csv(
    "data/processed/youtube_transcripts_clean.csv"
)

# Look at column names
print(youtube_transcripts_df.columns)

# Get all occupations
occupations = youtube_transcripts_df['occupation'].dropna().unique()

# Cleaning Stopwords
custom_stopwords = set([

    # conversational filler
    "just", "like", "really", "hey", "know", "think",
    "going", "dont", "didnt", "doesnt",
    "youre", "theyre", "thats", "actually",
    "okay", "right", "yeah", "yes", "want",
    "need", "things", "weve", "sure",
    "thing", "ive", "lets", "great",
    "role", "today", "stress",

    # extra filler
    "good", "lot", "say", "said",
    "got", "look", "doing",
    "make", "day", "help",
    "able", "person", "guys",
    "come", "thank", "theres",
    "new", "different", "absolutely",

    # generic work terms
    "work", "working", "job", "jobs",
    "worker", "workers", "customers",
    "shifts", "position",

    # youtube/general
    "video", "youtube", "channel",
    "time", "people",

    # occupation/common healthcare words
    "care", "support", "health",
    "hospital", "patient", "patients",
    "nurse", "nurses",

    # common australia filler
    "australia", "australian"
])

stopwords = ENGLISH_STOP_WORDS.union(custom_stopwords)

# Text Cleaning Function
def clean_text(text):

    text = text.lower()

    text = re.sub(r'[^a-z\s]', '', text)

    words = text.split()

    words = [
        w for w in words
        if w not in stopwords and len(w) > 2
    ]

    return " ".join(words)

# Get Clean Topics
def get_clean_topic_words(model, vectorizer, n_top_words=10):

    words = vectorizer.get_feature_names_out()

    topics = []

    for topic in model.components_:

        top_indices = topic.argsort()[::-1]

        selected = []

        for idx in top_indices:

            word = words[idx]

            # Remove overlapping words
            if any(word in w or w in word for w in selected):
                continue

            selected.append(word)

            if len(selected) == n_top_words:
                break

        topics.append(selected)

    return topics

# Auto Labelling
def auto_label(topic_words):

    categories = {

        "Health & social services": [
            "nursing", "clinical", "aged"
        ],

        "Education & training": [
            "teaching", "teacher", "children",
            "learning", "school", "class",
            "assistant"
        ],

        "Retail & customer service": [
            "retail", "store", "customer",
            "industry"
        ],

        "Employment & migration": [
            "visa", "salary", "employer",
            "pay"
        ],

        "Cleaning & maintenance": [
            "cleaning", "facility", "hygiene"
        ],

        "Workforce management & operations": [
            "management", "workforce",
            "organization", "operations"
        ]
    }

    scores = {}

    for category, keywords in categories.items():

        score = sum(word in topic_words for word in keywords)

        scores[category] = score

    best_category = max(scores, key=scores.get)

    if scores[best_category] == 0:
        return "Other"

    return best_category

# WordCloud Function
def displayWordcloudsByOccupation(all_topic_data):

    import matplotlib.pyplot as plt
    from wordcloud import WordCloud
    import math

    total_topics = sum(
        len(topics)
        for _, topics in all_topic_data
    )

    cols = 4
    rows = math.ceil(total_topics / cols)

    plt.figure(figsize=(22, rows * 4))

    plot_num = 1

    for occupation, topics in all_topic_data:

        for topic_id, topic_words in enumerate(topics):

            text = " ".join(topic_words)

            wordcloud = WordCloud(
                background_color='black',
                width=400,
                height=200,
            ).generate(text)

            plt.subplot(rows, cols, plot_num)

            plt.imshow(wordcloud)

            plt.axis("off")

            plt.title(
                f"{occupation.replace('_', ' ').title()}\nTopic {topic_id + 1}",
                fontsize=9,
                pad=8
            )

            plot_num += 1

    plt.tight_layout(pad=4.0)

    plt.savefig("all_occupation_wordclouds.png")

    plt.show()

all_topic_data = []

# Run Topic Modelling for Each Occupation
for occupation in occupations:

    print("\n" + "=" * 60)

    print(f"TOPICS FOR: {occupation.upper()}")

    print("=" * 60)

    # Filter occupation data
    filtered_df = youtube_transcripts_df[
        youtube_transcripts_df['occupation'] == occupation
    ]

    # Get transcript text
    text_data = filtered_df['text'].dropna().astype(str).tolist()

    # Clean text
    cleaned_documents = [

        clean_text(doc)

        for doc in text_data

        if len(doc.split()) > 2
    ]

    # Skip occupations with too little data
    if len(cleaned_documents) < 5:

        print("Not enough data.")

        continue

    # Vectorization
    vectorizer = CountVectorizer(

        max_df=0.8,

        min_df=2,

        ngram_range=(1,2)
    )

    doc_term_matrix = vectorizer.fit_transform(cleaned_documents)

    # LDA Model
    lda = LatentDirichletAllocation(

        n_components=3,

        random_state=42
    )

    lda.fit(doc_term_matrix)

    # Get Topics
    topics = get_clean_topic_words(lda, vectorizer)

    all_topic_data.append(
    (
        occupation,
        topics
    )
)

    print("\n===== TOPICS =====")

    # Print Topics
    for i, topic_words in enumerate(topics):

        label = auto_label(topic_words)

        print(f"\nTopic {i}: {label}")

        print(f"Keywords: {' | '.join(topic_words)}")

    displayWordcloudsByOccupation(all_topic_data)
