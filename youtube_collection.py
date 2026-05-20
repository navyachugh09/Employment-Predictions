"""YouTube Data Collection — Top 3 & Bottom 3 Victorian Occupations.

  TOP 3 (highest demand by total new workers needed 2025-35):
    1. Aged and disabled carers   (~64,889 new workers, +2.9%/yr)
    2. Sales assistants (general) (~51,960 new workers, +1.4%/yr — mostly churn)
    3. Registered nurses          (~43,024 new workers, +2.3%/yr)

  BOTTOM 3 (declining demand by shrinking workforce 2025-35):
    4. Commercial cleaners (-1,622 jobs, -0.46%/yr — automation pressure)
    5. Education aides     (-1,160 jobs, -0.33%/yr)
    6. Motor mechanics     (-978 jobs,   -0.33%/yr — EV transition)

This top/bottom contrast supports Deliverable 2 (sentiment analysis +
topic modelling): we expect distinctly different sentiment profiles
between high-growth and declining occupations, and topic modelling
should surface different pain points in each group.


"""

import json
import logging
import os
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Six occupations from the Victorian Skills Authority Employment Projections
# 2025-35 dataset. Search terms are tuned for Australian context and the
# kinds of YouTube content most likely to attract authentic worker /
# job-seeker discourse (career advice, day-in-the-life, training pathways,
# pay and conditions, industry outlook).
OCCUPATIONS = {
    # ---- TOP 3 (high-demand) ----
    'aged_and_disabled_carers': [
        'aged care worker Australia',
        'disability support worker Australia',
        'NDIS support worker Australia',
        'aged care jobs Victoria',
        'aged care burnout Australia',
    ],
    'sales_assistants': [
        'retail worker Australia',
        'sales assistant Australia',
        'working in retail Australia',
        'retail jobs Victoria',
        'retail customer service Australia',
    ],
    'registered_nurses': [
        'nursing Australia',
        'registered nurse Australia',
        'nursing jobs Victoria',
        'nursing career Australia',
        'nurse burnout Australia',
    ],
    # ---- BOTTOM 3 (declining-demand) ----
    'commercial_cleaners': [
        'commercial cleaning Australia',
        'cleaner job Australia',
        'cleaning industry Australia',
        'cleaning jobs Melbourne',
        'cleaner pay Australia',
    ],
    'education_aides': [
        'teacher aide Australia',
        'education support officer Victoria',
        'teaching assistant Australia',
        'integration aide school Victoria',
        'teacher aide pay Australia',
    ],
    'motor_mechanics': [
        'motor mechanic Australia',
        'auto mechanic apprenticeship Australia',
        'mechanic job Victoria',
        'car mechanic Australia',
        'EV transition mechanics Australia',
    ],
}

# Collection settings (per occupation)
VIDEOS_PER_OCCUPATION = 20
COMMENTS_PER_VIDEO = 100
REGION_CODE = 'AU'
RELEVANCE_LANGUAGE = 'en'
TRANSCRIPT_LANGUAGES = ['en', 'en-AU', 'en-GB', 'en-US']

RAW_DIR = Path('data/raw')


# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Setup / housekeeping
# ---------------------------------------------------------------------------

def init_youtube_client():
    """Load API key from .env and build the authenticated YouTube client."""
    load_dotenv()
    api_key = os.getenv('YOUTUBE_API_KEY')
    if not api_key:
        log.error(
            'YOUTUBE_API_KEY not found. Create a .env file in the project '
            'root containing: YOUTUBE_API_KEY=your_key_here'
        )
        sys.exit(1)
    client = build('youtube', 'v3', developerKey=api_key)
    log.info('YouTube API client initialised')
    return client


def wipe_raw_directory(preserve_checkpoint=False):
    """Delete the data/raw/ directory and recreate it empty.

    Called at start of every full run. We want a clean slate — partial
    old runs would otherwise be mixed in with new data by the cleaning
    script.

    When `preserve_checkpoint=True`, the transcript checkpoint file is
    kept (this is what resume mode uses). Pass False for a true fresh
    start.
    """
    checkpoint_json = RAW_DIR / 'transcripts_checkpoint.json'
    checkpoint_csv = RAW_DIR / 'transcripts_checkpoint.csv'
    saved_checkpoint = None
    saved_checkpoint_csv = None

    if preserve_checkpoint and checkpoint_json.exists():
        saved_checkpoint = checkpoint_json.read_bytes()
        if checkpoint_csv.exists():
            saved_checkpoint_csv = checkpoint_csv.read_bytes()
        log.info('Preserving transcript checkpoint for resume')

    if RAW_DIR.exists():
        n = sum(1 for _ in RAW_DIR.iterdir())
        if n > 0:
            log.warning(f'Wiping {n} existing files from {RAW_DIR}')
        shutil.rmtree(RAW_DIR)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    if saved_checkpoint is not None:
        checkpoint_json.write_bytes(saved_checkpoint)
        if saved_checkpoint_csv is not None:
            checkpoint_csv.write_bytes(saved_checkpoint_csv)

    log.info(f'{RAW_DIR} is ready')


def slugify(name):
    """Make an occupation key safe for use in filenames."""
    return re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')


# ---------------------------------------------------------------------------
# Video search
# ---------------------------------------------------------------------------

def search_videos(youtube, query, max_results=5):
    """Search YouTube AU for videos matching `query`. Returns list of dicts."""
    try:
        response = youtube.search().list(
            q=query,
            part='snippet',
            type='video',
            maxResults=max_results,
            regionCode=REGION_CODE,
            relevanceLanguage=RELEVANCE_LANGUAGE,
        ).execute()
    except HttpError as e:
        log.error(f'Search failed for "{query}": {e}')
        return []

    videos = []
    for item in response.get('items', []):
        # YouTube's search.list can return channel/playlist items even when
        # we request type='video'. Filter to actual video results, otherwise
        # item['id']['videoId'] doesn't exist and we crash.
        item_id = item.get('id', {})
        if item_id.get('kind') != 'youtube#video' or 'videoId' not in item_id:
            continue
        videos.append({
            'video_id': item_id['videoId'],
            'title': item['snippet']['title'],
            'channel': item['snippet']['channelTitle'],
            'published_at': item['snippet']['publishedAt'],
            'description': item['snippet']['description'],
            'search_query': query,
        })
    return videos


def collect_videos_for_occupation(youtube, occupation, search_terms, total_videos):
    """Distribute the per-occupation video budget across search terms.

    Deduplicates by video_id, since a single video can match multiple
    search terms (e.g. a "nurse burnout" video also shows for "nursing
    Australia").
    """
    per_term = max(1, total_videos // len(search_terms))
    seen_ids = set()
    all_videos = []

    for term in search_terms:
        log.info(f'  Searching: "{term}" (up to {per_term} videos)')
        videos = search_videos(youtube, term, max_results=per_term)
        for v in videos:
            if v['video_id'] not in seen_ids:
                v['occupation'] = occupation
                seen_ids.add(v['video_id'])
                all_videos.append(v)
        # Brief pause to be polite to the API
        time.sleep(0.5)

    log.info(f'  -> {len(all_videos)} unique videos for {occupation}')
    return all_videos


# ---------------------------------------------------------------------------
# Comment collection
# ---------------------------------------------------------------------------

def get_comments_for_video(youtube, video_id, max_comments=100):
    """Fetch up to max_comments top-level comments for a video.

    Returns an empty list on error (e.g. comments disabled, video deleted,
    quota exhausted). All errors are logged so failures aren't silent.
    """
    comments = []
    next_page_token = None

    while len(comments) < max_comments:
        try:
            response = youtube.commentThreads().list(
                part='snippet',
                videoId=video_id,
                maxResults=min(100, max_comments - len(comments)),
                pageToken=next_page_token,
                textFormat='plainText',
            ).execute()
        except HttpError as e:
            reason = (
                e.error_details[0].get('reason', 'unknown')
                if e.error_details else 'unknown'
            )
            log.warning(f'  Comments unavailable for {video_id}: {reason}')
            return comments

        for item in response.get('items', []):
            snippet = item['snippet']['topLevelComment']['snippet']
            comments.append({
                'comment_id': item['id'],
                'video_id': video_id,
                'text': snippet['textDisplay'],
                'author': snippet['authorDisplayName'],
                'published_at': snippet['publishedAt'],
                'updated_at': snippet['updatedAt'],
                'like_count': snippet['likeCount'],
                'reply_count': item['snippet']['totalReplyCount'],
                'source': 'youtube_comment',
            })

        next_page_token = response.get('nextPageToken')
        if not next_page_token:
            break
        time.sleep(0.3)

    return comments


def collect_all_comments(youtube, all_videos):
    """Iterate over every collected video and pull its comments.

    Each comment is enriched with video-level context (occupation, title,
    channel, search query) so downstream analysis can group by any of
    those dimensions without a join.
    """
    all_comments = []
    for i, video in enumerate(all_videos, 1):
        log.info(f'[{i}/{len(all_videos)}] {video["title"][:60]}...')
        comments = get_comments_for_video(
            youtube, video['video_id'], max_comments=COMMENTS_PER_VIDEO,
        )
        for c in comments:
            c['occupation'] = video['occupation']
            c['video_title'] = video['title']
            c['video_channel'] = video['channel']
            c['search_query'] = video['search_query']
        all_comments.extend(comments)
        log.info(
            f'  -> {len(comments)} comments '
            f'(running total: {len(all_comments)})'
        )

    log.info(
        f'COMMENTS COMPLETE: {len(all_comments)} comments from '
        f'{len(all_videos)} videos'
    )
    return all_comments


# ---------------------------------------------------------------------------
# Transcript collection
# ---------------------------------------------------------------------------

def get_transcript_for_video(ytt_api, video_id, languages=None):
    """Fetch transcript for one video.

    Returns (status, data) tuple:
      ('ok',         dict)   — transcript fetched
      ('missing',    None)   — no transcript exists for this video
      ('unavailable', None)  — video removed/private
      ('blocked',    None)   — IP block / rate limit (caller should pause)
      ('error',      None)   — other error
    """
    languages = languages or ['en']
    try:
        fetched = ytt_api.fetch(video_id, languages=languages)
    except (TranscriptsDisabled, NoTranscriptFound):
        log.info(f'  No transcript available for {video_id}')
        return 'missing', None
    except VideoUnavailable:
        log.warning(f'  Video unavailable: {video_id}')
        return 'unavailable', None
    except Exception as e:
        # Detect IP block specifically so the caller can stop hammering YouTube
        err_name = type(e).__name__
        err_text = str(e).lower()
        is_block = (
            err_name in ('IpBlocked', 'RequestBlocked', 'TooManyRequests')
            or 'ipblocked' in err_text
            or 'blocking requests' in err_text
            or 'too many requests' in err_text
        )
        if is_block:
            log.error(f'  IP BLOCKED on {video_id} ({err_name})')
            return 'blocked', None
        log.error(f'  Transcript fetch failed for {video_id}: {err_name}: {e}')
        return 'error', None

    full_text = ' '.join(snippet.text for snippet in fetched)
    return 'ok', {
        'video_id': video_id,
        'text': full_text,
        'segment_count': len(fetched),
        'word_count': len(full_text.split()),
        'source': 'youtube_transcript',
    }


def collect_all_transcripts(all_videos):
    """Iterate over every video and attempt to fetch its transcript.

    Resilience features (added after observing IP blocks mid-run):
      - CHECKPOINTING: writes data/raw/transcripts_checkpoint.{json,csv}
        every CHECKPOINT_EVERY successful fetches. If the script crashes
        or hits an unrecoverable IP block, progress is preserved.
      - RESUME: on startup, reads the checkpoint and skips any video_id
        that was already fetched. Re-running the script picks up where
        the last run stopped.
      - IP-BLOCK CIRCUIT BREAKER: after CONSECUTIVE_BLOCK_LIMIT IP blocks
        in a row, stops trying. Hammering a blocked IP just wastes time
        and makes the block last longer. Whatever's been fetched so far
        is saved.
    """
    CHECKPOINT_EVERY = 10
    CONSECUTIVE_BLOCK_LIMIT = 5
    CHECKPOINT_JSON = RAW_DIR / 'transcripts_checkpoint.json'
    CHECKPOINT_CSV = RAW_DIR / 'transcripts_checkpoint.csv'

    ytt_api = YouTubeTranscriptApi()

    # Resume: load any previously checkpointed transcripts
    all_transcripts = []
    already_done = set()
    if CHECKPOINT_JSON.exists():
        try:
            with open(CHECKPOINT_JSON, encoding='utf-8') as f:
                all_transcripts = json.load(f)
            already_done = {t['video_id'] for t in all_transcripts}
            log.info(
                f'Resuming from checkpoint: {len(already_done)} transcripts '
                f'already fetched, will skip those'
            )
        except Exception as e:
            log.warning(f'Could not read checkpoint ({e}); starting fresh')
            all_transcripts = []
            already_done = set()

    failures = []
    consecutive_blocks = 0
    aborted = False

    def write_checkpoint():
        """Save current progress to disk. Called periodically and on abort."""
        with open(CHECKPOINT_JSON, 'w', encoding='utf-8') as f:
            json.dump(all_transcripts, f, ensure_ascii=False, indent=2, default=str)
        if all_transcripts:
            pd.DataFrame(all_transcripts).to_csv(
                CHECKPOINT_CSV, index=False, encoding='utf-8',
            )

    for i, video in enumerate(all_videos, 1):
        vid = video['video_id']
        if vid in already_done:
            log.info(f'[{i}/{len(all_videos)}] SKIP (already done): {video["title"][:55]}')
            continue

        log.info(
            f'[{i}/{len(all_videos)}] Transcript: {video["title"][:60]}...'
        )
        status, result = get_transcript_for_video(
            ytt_api, vid, languages=TRANSCRIPT_LANGUAGES,
        )

        if status == 'blocked':
            consecutive_blocks += 1
            failures.append(vid)
            if consecutive_blocks >= CONSECUTIVE_BLOCK_LIMIT:
                log.error(
                    f'ABORTING transcripts: {consecutive_blocks} consecutive '
                    f'IP blocks. YouTube has rate-limited your IP. Comments '
                    f'were saved fine. To get more transcripts, wait a few '
                    f'hours then re-run — the checkpoint will let you '
                    f'resume from this point.'
                )
                aborted = True
                break
            # Pause a bit before next attempt — might be temporary
            time.sleep(2.0)
            continue

        # Any non-block outcome resets the consecutive counter
        consecutive_blocks = 0

        if status != 'ok':
            failures.append(vid)
            continue

        result['occupation'] = video['occupation']
        result['video_title'] = video['title']
        result['video_channel'] = video['channel']
        result['published_at'] = video['published_at']
        result['search_query'] = video['search_query']
        all_transcripts.append(result)
        log.info(f'  -> {result["word_count"]} words')

        # Periodic checkpoint — guarantees we never lose more than
        # CHECKPOINT_EVERY transcripts of progress
        if len(all_transcripts) % CHECKPOINT_EVERY == 0:
            write_checkpoint()
            log.info(f'  [checkpoint] {len(all_transcripts)} transcripts saved')

        time.sleep(0.5)

    # Final checkpoint write — captures anything since the last interval
    write_checkpoint()

    log.info(
        f'TRANSCRIPTS {"ABORTED" if aborted else "COMPLETE"}: '
        f'{len(all_transcripts)} fetched, {len(failures)} failed'
    )
    if aborted:
        log.warning(
            'Re-run the script later to resume transcript collection. '
            'Comments and video metadata are already saved.'
        )
    elif failures and len(failures) > len(all_videos) * 0.5:
        log.warning(
            f'Over 50% of transcripts failed '
            f'({len(failures)}/{len(all_videos)}). This usually means an '
            f'IP block — try running from a different network, or set up '
            f'Webshare proxies (see youtube-transcript-api docs on PyPI).'
        )

    return all_transcripts


# ---------------------------------------------------------------------------
# Inspection and persistence
# ---------------------------------------------------------------------------

def summarise(comments, transcripts):
    """Print a human-readable collection summary to stdout."""
    df_c = pd.DataFrame(comments)
    df_t = pd.DataFrame(transcripts)

    print()
    print('=' * 65)
    print('COLLECTION SUMMARY')
    print('=' * 65)

    if not df_c.empty:
        df_c['published_at'] = pd.to_datetime(df_c['published_at'])
        print('\n--- COMMENTS ---')
        print(f'Total:          {len(df_c)}')
        print(f'Unique videos:  {df_c["video_id"].nunique()}')
        print(
            f'Date range:     {df_c["published_at"].min().date()} -> '
            f'{df_c["published_at"].max().date()}'
        )
        print('\nPer occupation:')
        print(df_c.groupby('occupation').size().to_string())
        print('\nPer year (for ARIMA feasibility — needs >=24 months):')
        print(df_c.groupby(df_c['published_at'].dt.year).size().to_string())
    else:
        print('\nNo comments collected.')

    if not df_t.empty:
        print('\n--- TRANSCRIPTS ---')
        print(f'Videos with transcripts: {len(df_t)}')
        print(f'Total words:             {df_t["word_count"].sum():,}')
        print(f'Median words/transcript: {df_t["word_count"].median():.0f}')
        print('\nPer occupation:')
        print(df_t.groupby('occupation').size().to_string())
    else:
        print(
            '\n--- TRANSCRIPTS ---\n'
            'No transcripts collected. Check logs above — likely an IP '
            'block or all videos lack captions.'
        )
    print()


def save_outputs(comments, transcripts, videos, output_dir):
    """Save per-occupation and combined files, all date-stamped.

    Per-occupation files make it easy to load just one occupation for
    sentiment / topic modelling later (Weeks 4-5). The combined files
    are convenient for cross-occupation comparison and top-vs-bottom
    contrast analysis.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d')

    log.info('Saving outputs:')

    # Per-occupation splits
    occupations = sorted({v['occupation'] for v in videos})
    for occ in occupations:
        occ_comments = [c for c in comments if c.get('occupation') == occ]
        occ_transcripts = [t for t in transcripts if t.get('occupation') == occ]
        occ_videos = [v for v in videos if v.get('occupation') == occ]

        c_json = output_dir / f'youtube_comments_{occ}_{timestamp}.json'
        c_csv = output_dir / f'youtube_comments_{occ}_{timestamp}.csv'
        t_json = output_dir / f'youtube_transcripts_{occ}_{timestamp}.json'
        t_csv = output_dir / f'youtube_transcripts_{occ}_{timestamp}.csv'
        v_json = output_dir / f'youtube_videos_{occ}_{timestamp}.json'

        with open(c_json, 'w', encoding='utf-8') as f:
            json.dump(occ_comments, f, ensure_ascii=False, indent=2, default=str)
        if occ_comments:
            pd.DataFrame(occ_comments).to_csv(c_csv, index=False, encoding='utf-8')

        with open(t_json, 'w', encoding='utf-8') as f:
            json.dump(occ_transcripts, f, ensure_ascii=False, indent=2, default=str)
        if occ_transcripts:
            pd.DataFrame(occ_transcripts).to_csv(t_csv, index=False, encoding='utf-8')

        with open(v_json, 'w', encoding='utf-8') as f:
            json.dump(occ_videos, f, ensure_ascii=False, indent=2, default=str)

        log.info(
            f'  [{occ}] {len(occ_comments)} comments, '
            f'{len(occ_transcripts)} transcripts, {len(occ_videos)} videos'
        )

    # Combined files (all occupations together)
    df_comments = pd.DataFrame(comments)
    df_transcripts = pd.DataFrame(transcripts)
    if not df_comments.empty:
        df_comments.to_csv(
            output_dir / f'youtube_comments_all_{timestamp}.csv',
            index=False, encoding='utf-8',
        )
    if not df_transcripts.empty:
        df_transcripts.to_csv(
            output_dir / f'youtube_transcripts_all_{timestamp}.csv',
            index=False, encoding='utf-8',
        )
    with open(output_dir / f'youtube_videos_all_{timestamp}.json', 'w',
              encoding='utf-8') as f:
        json.dump(videos, f, ensure_ascii=False, indent=2, default=str)

    log.info(
        f'  [combined] {len(df_comments)} comments, '
        f'{len(df_transcripts)} transcripts, {len(videos)} videos'
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # --resume re-uses the transcript checkpoint and the existing video list
    # so you can pick up after an IP block without re-searching or re-pulling
    # comments. Without it, the script starts fresh.
    resume = '--resume' in sys.argv

    log.info('=' * 60)
    log.info('YouTube Data Collection — Top 3 + Bottom 3 Occupations')
    if resume:
        log.info('MODE: RESUME (transcript checkpoint preserved)')
    log.info('=' * 60)
    log.info(f'Occupations: {list(OCCUPATIONS.keys())}')
    log.info(
        f'Target per occupation: {VIDEOS_PER_OCCUPATION} videos x up to '
        f'{COMMENTS_PER_VIDEO} comments + transcripts'
    )

    # Step 1: Prepare data/raw/. Resume mode keeps the checkpoint;
    # normal mode wipes everything for a clean run.
    wipe_raw_directory(preserve_checkpoint=resume)

    # Step 2: Authenticate
    youtube = init_youtube_client()

    # Step 3: Find videos for each occupation
    all_videos = []
    for occupation, search_terms in OCCUPATIONS.items():
        log.info(f'Searching for: {occupation}')
        videos = collect_videos_for_occupation(
            youtube, occupation, search_terms, VIDEOS_PER_OCCUPATION,
        )
        all_videos.extend(videos)
    log.info(f'TOTAL: {len(all_videos)} unique videos across all occupations')

    if not all_videos:
        log.error('No videos found — check your API key, quota, and network')
        sys.exit(1)

    # Step 4: Pull comments (uses official API — won't get IP-blocked)
    all_comments = collect_all_comments(youtube, all_videos)

    # Step 5: SAVE COMMENTS + VIDEOS NOW, before risky transcript step.
    # Transcript fetching uses the unofficial API and can get IP-blocked
    # mid-way through. If that happens we want comments already on disk.
    log.info('Saving comments + video metadata before transcript step...')
    save_outputs(all_comments, [], all_videos, RAW_DIR)

    # Step 6: Pull transcripts (checkpoints incrementally; can be resumed)
    all_transcripts = collect_all_transcripts(all_videos)

    # Step 7: Final save — now with transcripts included
    summarise(all_comments, all_transcripts)
    save_outputs(all_comments, all_transcripts, all_videos, RAW_DIR)

    log.info('Collection complete. Next step: run `python youtube_cleaning.py`')
    if all_transcripts:
        log.info(
            f'If transcripts seem low ({len(all_transcripts)}/{len(all_videos)}), '
            f'wait a few hours and re-run with: python youtube_collection.py --resume'
        )


if __name__ == '__main__':
    main()