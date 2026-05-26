# Imports
import pandas as pd
import re
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS
from sklearn.decomposition import LatentDirichletAllocation

# Load Data
employment_df = pd.read_excel("employment_projections_cleaned.xlsx")

#Looks at column names
print(employment_df.columns)

text_data = employment_df['industry'].dropna().astype(str).tolist()

# Cleaning
custom_stopwords = set(["services", "service", "industry"])
stopwords = ENGLISH_STOP_WORDS.union(custom_stopwords)

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-z\s]', '', text)
    words = text.split()
    words = [w for w in words if w not in stopwords and len(w) > 2]
    return " ".join(words)

cleaned_documents = [clean_text(doc) for doc in text_data if len(doc.split()) > 2]

# =Vectorization
vectorizer = CountVectorizer(max_df=0.8, min_df=2, ngram_range=(1,2))
doc_term_matrix = vectorizer.fit_transform(cleaned_documents)

# LDA Model
lda = LatentDirichletAllocation(n_components=4, random_state=42)
lda.fit(doc_term_matrix)

# Get Clean Topics
def get_clean_topic_words(model, vectorizer, n_top_words=10):
    words = vectorizer.get_feature_names_out()
    topics = []
    
    for topic in model.components_:
        top_indices = topic.argsort()[::-1]
        selected = []
        
        for idx in top_indices:
            word = words[idx]
            
            if any(word in w or w in word for w in selected):
                continue
            
            selected.append(word)
            
            if len(selected) == n_top_words:
                break
        
        topics.append(selected)
    
    return topics

# Auto Labelling
def auto_label(topic_words):
    if "health" in topic_words or "care" in topic_words:
        return "Health & social services"
    elif "electricity" in topic_words or "gas" in topic_words:
        return "Utilities"
    elif "real" in topic_words or "estate" in topic_words:
        return "Real estate & rental"
    elif "agriculture" in topic_words or "transport" in topic_words:
        return "Agriculture & logistics"
    elif "administration" in topic_words or "education" in topic_words:
        return "Government & education"
    elif "media" in topic_words or "telecommunications" in topic_words:
        return "Media & hospitality"
    else:
        return "Other"

# Print Topics
topics = get_clean_topic_words(lda, vectorizer)

print("\n===== TOPICS =====")

for i, topic_words in enumerate(topics):
    label = auto_label(topic_words)
    
    print(f"\nTopic {i}: {label}")
    print(f"Keywords: {' | '.join(topic_words)}")


# WordCloud
def displayWordcloud(model, featureNames):
    import numpy as np
    import math
    import matplotlib.pyplot as plt
    from wordcloud import WordCloud

    normalisedComponents = model.components_ / model.components_.sum(axis=1)[:, np.newaxis]

    topicNum = len(model.components_)
    plotColNum = 2
    plotRowNum = int(math.ceil(topicNum / plotColNum))

    plt.figure(figsize=(12, 8))

    for topicId, lTopicDist in enumerate(normalisedComponents):
        lWordProb = {
            featureNames[i]: float(wordProb)
            for i, wordProb in enumerate(lTopicDist)
        }

        wordcloud = WordCloud(background_color='black').generate_from_frequencies(lWordProb)

        plt.subplot(plotRowNum, plotColNum, topicId + 1)
        plt.title(f'Topic {topicId + 1}')
        plt.imshow(wordcloud)
        plt.axis("off")

    plt.tight_layout()
    plt.show()


displayWordcloud(lda, vectorizer.get_feature_names_out())