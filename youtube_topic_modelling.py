
# Imports
import pandas as pd
import re
import json
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
print("\nOccupations found:")
print(occupations)
print("Count:", len(occupations))

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
    "australia", "australian",

    # contractions
    "youll", "youve","youd","im",
    "ill", "isnt", "wasnt", "werent",
    "cant", "couldnt", "shouldnt",
    "wouldnt", "wont", "didnt", "doesnt",
    "dont",

    # more youtube filler
    "video", "videos", "watch",
    "watching", "comment", "comments",
    "subscribe",

    # generic occupation filler
    "career", "experience", "years",
    "year", "industry", "role",
    "roles" 
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
            "retail", "store", "customer"
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

        score = sum(
            word in topic_words
            for word in keywords
        )

        scores[category] = score

    best_category = max(
        scores,
        key=scores.get
    )

    if scores[best_category] == 0:
        return "Other"

    return best_category


def generate_insight(label):

    insights = {

        "Health & social services":
        "Discussions focus on healthcare responsibilities, patient care and workplace experiences.",

        "Education & training":
        "Discussions focus on teaching, learning environments and supporting students.",

        "Retail & customer service":
        "Discussions focus on customer interactions, sales environments and retail work.",

        "Employment & migration":
        "Discussions highlight career opportunities, salaries and employment pathways.",

        "Cleaning & maintenance":
        "Discussions focus on cleaning duties, workplace hygiene and maintenance activities.",

        "Workforce management & operations":
        "Discussions focus on workforce planning, organisational processes and operational responsibilities."
    }

    return insights.get(
        label,
        "This topic represents a common discussion theme found within the occupation."
    )


# WordCloud Function
from wordcloud import WordCloud
import matplotlib.pyplot as plt
import os

def save_topic_wordclouds(all_topic_data):

    output_folder = "public/assets/images/topic_wordclouds"

    os.makedirs(output_folder, exist_ok=True)

    for occupation, topics in all_topic_data:

        for topic_id, topic_words in enumerate(topics):

            text = " ".join(topic_words)

            wordcloud = WordCloud(
                background_color="white",
                width=600,
                height=300
            ).generate(text)

            filename = (
                f"{occupation}_topic{topic_id + 1}.png"
            )

            filepath = os.path.join(
                output_folder,
                filename
            )

            plt.figure(figsize=(6, 3))

            plt.imshow(wordcloud)

            plt.axis("off")

            plt.tight_layout()

            plt.savefig(
                filepath,
                bbox_inches="tight"
            )

            plt.close()

all_topic_data = []

# Run Topic Modelling for Each Occupation
for occupation in occupations:

    print("\n" + "=" * 60)
    print(f"TOPICS FOR: {occupation.upper()}")
    print("=" * 60)

    filtered_df = youtube_transcripts_df[
        youtube_transcripts_df['occupation'] == occupation
    ]

    text_data = filtered_df['text'].dropna().astype(str).tolist()

    cleaned_documents = [

        clean_text(doc)

        for doc in text_data

        if len(doc.split()) > 2
    ]

    if len(cleaned_documents) < 5:

        print("Not enough data.")

        continue

    vectorizer = CountVectorizer(

        max_df=0.8,

        min_df=2,

        ngram_range=(1, 2)

    )

    doc_term_matrix = vectorizer.fit_transform(
        cleaned_documents
    )

    lda = LatentDirichletAllocation(

        n_components=3,

        random_state=42

    )

    lda.fit(doc_term_matrix)

    topics = get_clean_topic_words(
        lda,
        vectorizer
    )

    all_topic_data.append(

        (
            occupation,
            topics
        )

    )

  


# Generate Wordcloud Images
save_topic_wordclouds(all_topic_data)


# Create Dashboard JSON
dashboard_topics = []

for occupation, topics in all_topic_data:

    occupation_topics = {

        "occupation": occupation,

        "topics": []

    }

    for i, topic_words in enumerate(topics):

        label = auto_label(topic_words)

        occupation_topics["topics"].append({

        "topic_id": i + 1,

        "label": label,

        "keywords": topic_words,

        "insight": generate_insight(label),

        "wordcloud":
        f"assets/images/topic_wordclouds/{occupation}_topic{i+1}.png"

    })

    dashboard_topics.append(
        occupation_topics
    )


with open(
    "data/topic_modelling_results.json",
    "w"
) as f:

    json.dump(
        dashboard_topics,
        f,
        indent=4
    )

print(
    "\nTopic modelling JSON saved successfully."
)

print("\n===== TOPICS =====")

 # Print Topics
for i, topic_words in enumerate(topics):

        label = auto_label(topic_words)

        print(f"\nTopic {i}: {label}")

        print(f"Keywords: {' | '.join(topic_words)}")

save_topic_wordclouds(all_topic_data)
