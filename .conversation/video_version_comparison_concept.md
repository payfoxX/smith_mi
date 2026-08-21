# Video Version Comparison & Metadata QC

*Product concept and recommended direction*

## Feasibility

Yes—this is very possible, and it is a strong post-production quality-control product. The core workflow is: upload Version 1, upload Version 2, automatically analyze both files, and review the differences side by side at the frame and timecode level.

## Important technical distinction

Metadata2Go should handle file and version metadata, while the blue/red visual visualization needs a separate video frame-difference engine. Metadata tells the system what changed about the files; frame comparison tells the reviewer what changed inside the picture.

| Layer | Purpose |
|---|---|
| **Metadata layer** | Extract codec, resolution, frame rate, duration, audio layout, timecode, checksum, and other technical properties. |
| **Visual comparison layer** | Compare corresponding video frames and identify added, removed, or changed image regions. |
| **QC/reporting layer** | Summarize meaningful differences, timecodes, warnings, and reviewer decisions. |

## Recommended user experience

- Upload Version 1 and Version 2 and assign clear labels to each version.
- Automatically extract technical metadata and calculate file checksums.
- Align the videos by timecode or detected scene/shot—not only by frame number.
- Review synchronized playback with a split screen, swipe slider, or flicker comparison.
- Step through individual frames and display exact frame numbers and timecodes.
- Jump from one detected change to the next using a change list or timeline markers.
- Export a QC report containing screenshots, timecodes, metadata differences, and reviewer notes.

## Visual difference indicators

The proposed visual language is useful and can be implemented as an overlay:

- **Blue pixel-level or region-level highlights:** Newly added visual content in Version 2.
- **Red pixel-level or region-level highlights:** Content present in Version 1 but removed from Version 2.
- **No highlights:** Areas that remain visually unchanged.
- **Optional yellow or orange highlights:** Changed content that is neither clearly added nor removed—for example, color, brightness, crop, or position changes.

## A better approach than isolated tiny dots

The application should support tiny-pixel precision, but it should not show millions of disconnected dots as the main review experience. Nearby changed pixels should be grouped into highlighted regions or contours, while a zoomed-in mode can reveal the individual pixel-level detail.

This makes the tool practical for identifying missing graphics, title changes, bad edits, crop shifts, and encoding problems without creating visual noise.

## Recommended technical approach

- Use **FFmpeg** for decoding, proxy generation, frame extraction, timecode handling, and technical media inspection.
- Use **OpenCV** or an equivalent perceptual comparison engine for frame differencing, masks, morphology, and region grouping.
- Use perceptual thresholds rather than exact RGB equality so normal compression variation is not reported as a creative change.
- Apply temporal smoothing and persistence rules so a one-frame compression artifact does not become a false alarm.
- Use browser-side playback for review and server-side processing for large files and repeatable QC results.
- Store original files separately from generated proxies, difference masks, thumbnails, and reports.
- Keep processing jobs asynchronous, with progress tracking, retry handling, and a visible processing status.

## Problems the product must solve

- Different frame rates or variable-frame-rate media can cause frames to be compared incorrectly.
- A change in resolution, aspect ratio, crop, or scaling can make the entire frame appear different.
- Color-space, gamma, HDR/SDR, bit-depth, and codec changes can create false positives.
- Small timing shifts require timecode alignment or motion-aware matching.
- A scene cut should be recognized so the system does not compare unrelated shots.
- Compression noise, grain, film texture, and moving objects require adjustable sensitivity controls.
- Large professional video files require proxy workflows, resumable uploads, and efficient storage.

## Post-production QC checks to include

- Visual changes at exact timecodes.
- Missing or added shots and scene-duration changes.
- Dropped, duplicated, or shifted frames.
- Video duration and frame-count mismatch.
- Audio duration, channel-layout, sample-rate, and sync differences.
- Black frames, frozen frames, unexpected silence, or clipping.
- Resolution, aspect ratio, frame rate, codec, bitrate, color space, and HDR metadata changes.
- Subtitle, caption, logo, watermark, title, or lower-third changes.

## Suggested MVP

The first useful version should stay focused:

- MP4 and MOV upload support.
- Two-version comparison only: Version 1 versus Version 2.
- Automatic metadata extraction.
- Synchronized split-screen player with a swipe divider.
- Blue/red difference overlay with adjustable sensitivity.
- Timeline markers for detected changes.
- Frame stepping with timecode display.
- Downloadable HTML or PDF QC report.

## Future product capabilities

- Support for Version 3, Version 4, and a complete version history.
- Project folders, approvals, reviewer comments, and audit trails.
- Automatic pass/fail rules for delivery specifications.
- Side-by-side comparison of audio waveforms and loudness measurements.
- Integration with editing, review, storage, and media asset-management systems.
- Team accounts, permissions, notifications, and client-facing review links.
- Machine-assisted classification of changes: editorial, graphics, color, encoding, or technical.

## Product recommendation

Build this as a **video QC and version-monitoring application**, not merely a metadata viewer. Metadata2Go can be part of the technical inspection layer, but the product’s differentiator is the aligned, timecode-aware visual comparison with noise-resistant change detection and a reviewer-friendly report.

## Conclusion

The concept is technically feasible and commercially meaningful. The strongest implementation combines metadata comparison, perceptual video differencing, synchronized review tools, and production-ready QC reporting.

The most important design decision is to distinguish real creative changes from harmless encoding and color-processing differences.
