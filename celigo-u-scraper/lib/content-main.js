/**
 * Celigo U Scraper - Main Page Content Script
 * Runs on the main training.celigo.com page
 * Extracts Skilljar metadata and attempts to get content from iframes
 */

(function() {
    'use strict';

    // Store scraped data
    let pageData = {
        metadata: {},
        content: {}
    };

    /**
     * Extract Skilljar metadata from global variables
     */
    function extractSkilljarMetadata() {
        const metadata = {
            url: window.location.href,
            scrapedAt: new Date().toISOString()
        };

        // Try to get skilljarCourse data
        try {
            const script = document.querySelector('script:not([src])');
            const scripts = document.querySelectorAll('script:not([src])');
            
            for (const s of scripts) {
                const text = s.textContent;
                
                // Extract course info
                if (text.includes('skilljarCourse')) {
                    const courseMatch = text.match(/var skilljarCourse\s*=\s*({[\s\S]*?});/);
                    if (courseMatch) {
                        try {
                            // Clean up the JavaScript object notation
                            let courseStr = courseMatch[1]
                                .replace(/'/g, '"')
                                .replace(/\\u002D/g, '-')
                                .replace(/(\w+):/g, '"$1":')
                                .replace(/,\s*}/g, '}');
                            
                            // Fallback: extract specific fields manually
                            const titleMatch = text.match(/title:\s*['"]([^'"]+)['"]/);
                            const lessonMatch = text.match(/lesson:\s*{[^}]*title:\s*['"]([^'"]+)['"]/);
                            const descMatch = text.match(/short_description:\s*['"]([^'"]+)['"]/);
                            
                            metadata.course = titleMatch ? titleMatch[1] : '';
                            metadata.lesson = lessonMatch ? lessonMatch[1] : '';
                            metadata.description = descMatch ? descMatch[1] : '';
                        } catch (e) {
                            console.log('Error parsing course data:', e);
                        }
                    }
                }
                
                // Extract lesson progress
                if (text.includes('skilljarLessonProgress')) {
                    const progressMatch = text.match(/skilljarLessonProgress\s*=\s*({[\s\S]*?});/);
                    if (progressMatch) {
                        metadata.lessonProgress = progressMatch[1];
                    }
                }
            }
        } catch (e) {
            console.log('Metadata extraction error:', e);
        }

        // Get from visible page elements as fallback
        const courseTitle = document.querySelector('.course-title');
        const lessonTitle = document.querySelector('.lesson-top h2, #lesson-main h2');
        
        if (!metadata.course && courseTitle) {
            metadata.course = courseTitle.textContent.trim();
        }
        if (!metadata.lesson && lessonTitle) {
            metadata.lesson = lessonTitle.textContent.trim();
        }

        // Get curriculum/lesson list
        const lessonItems = document.querySelectorAll('#curriculum-list-2 .lesson');
        if (lessonItems.length > 0) {
            metadata.curriculum = Array.from(lessonItems).map((item, index) => ({
                index: index + 1,
                title: item.querySelector('.title')?.textContent.trim() || '',
                completed: item.classList.contains('lesson-complete'),
                current: item.classList.contains('lesson-active') || item.getAttribute('aria-current') === 'page'
            }));
        }

        return metadata;
    }

    /**
     * Extract content from the main page (non-iframe)
     */
    function extractMainPageContent() {
        const content = {
            flipCards: [],
            hotspots: [],
            knowledgeChecks: [],
            accordions: [],
            tabs: [],
            images: [],
            textBlocks: [],
            lists: [],
            tables: [],
            videos: []
        };

        // The actual SCORM content is in an iframe, but let's check for any direct content
        const mainContent = document.querySelector('#lesson-main-content');
        
        if (mainContent) {
            // Extract any visible text
            const textElements = mainContent.querySelectorAll('p, div.content, .description');
            textElements.forEach((el, i) => {
                const text = el.textContent.trim();
                if (text && text.length > 20) {
                    content.textBlocks.push({
                        id: `main-text-${i}`,
                        content: text,
                        source: 'main-page'
                    });
                }
            });
        }

        return content;
    }

    /**
     * Try to extract content from SCORM iframe
     */
    function extractIframeContent() {
        const content = {
            flipCards: [],
            hotspots: [],
            knowledgeChecks: [],
            accordions: [],
            tabs: [],
            images: [],
            textBlocks: [],
            lists: [],
            tables: [],
            videos: [],
            rawText: ''
        };

        const iframe = document.querySelector('#scorm_content_frame');
        if (!iframe) {
            console.log('SCORM iframe not found');
            return content;
        }

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (!iframeDoc) {
                console.log('Cannot access iframe document');
                return content;
            }

            // Extract from iframe document
            content.flipCards = extractFlipCards(iframeDoc);
            content.hotspots = extractHotspots(iframeDoc);
            content.knowledgeChecks = extractKnowledgeChecks(iframeDoc);
            content.accordions = extractAccordions(iframeDoc);
            content.tabs = extractTabs(iframeDoc);
            content.images = extractImages(iframeDoc);
            content.textBlocks = extractTextBlocks(iframeDoc);
            content.lists = extractLists(iframeDoc);
            content.tables = extractTables(iframeDoc);
            content.videos = extractVideos(iframeDoc);
            content.rawText = extractRawText(iframeDoc);

        } catch (e) {
            console.log('Iframe access error (likely cross-origin):', e.message);
        }

        return content;
    }

    /**
     * Extract flip cards (common in Articulate/Rise content)
     */
    function extractFlipCards(doc) {
        const cards = [];
        
        // Articulate Rise flip cards
        const flipCardElements = doc.querySelectorAll(
            '[class*="flip-card"], [class*="flipcard"], [data-type="flip-card"], ' +
            '.blocks-flip-card, .block-flip-card__card, [class*="FlipCard"]'
        );
        
        flipCardElements.forEach((card, i) => {
            const front = card.querySelector('[class*="front"], [class*="Front"], .flip-card-front')?.textContent.trim();
            const back = card.querySelector('[class*="back"], [class*="Back"], .flip-card-back')?.textContent.trim();
            
            if (front || back) {
                cards.push({
                    id: `flip-${i}`,
                    front: front || '',
                    back: back || '',
                    type: 'flip-card'
                });
            }
        });

        // Also check for any elements with flip-related data attributes
        const dataFlipElements = doc.querySelectorAll('[data-flip], [data-card-type="flip"]');
        dataFlipElements.forEach((el, i) => {
            const text = el.textContent.trim();
            if (text && !cards.some(c => c.front === text || c.back === text)) {
                cards.push({
                    id: `flip-data-${i}`,
                    content: text,
                    type: 'flip-card-element'
                });
            }
        });

        return cards;
    }

    /**
     * Extract hotspots (interactive clickable areas)
     */
    function extractHotspots(doc) {
        const hotspots = [];
        
        const hotspotElements = doc.querySelectorAll(
            '[class*="hotspot"], [class*="Hotspot"], [data-type="hotspot"], ' +
            '.labeled-graphic__marker, [class*="marker"], [class*="pin"]'
        );
        
        hotspotElements.forEach((hs, i) => {
            const label = hs.querySelector('[class*="label"], [class*="title"], .marker-label')?.textContent.trim();
            const content = hs.querySelector('[class*="content"], [class*="description"], .marker-content')?.textContent.trim();
            const tooltip = hs.getAttribute('title') || hs.getAttribute('aria-label');
            
            if (label || content || tooltip) {
                hotspots.push({
                    id: `hotspot-${i}`,
                    label: label || tooltip || '',
                    content: content || '',
                    type: 'hotspot'
                });
            }
        });

        return hotspots;
    }

    /**
     * Extract knowledge checks / quizzes
     */
    function extractKnowledgeChecks(doc) {
        const checks = [];
        
        // Common quiz/knowledge check selectors
        const questionElements = doc.querySelectorAll(
            '[class*="question"], [class*="Question"], [data-type="question"], ' +
            '[class*="quiz"], [class*="Quiz"], .knowledge-check, ' +
            '[class*="assessment"], [role="group"][aria-label*="question"]'
        );
        
        questionElements.forEach((q, i) => {
            const questionText = q.querySelector(
                '[class*="question-text"], [class*="stem"], .question__text, ' +
                '[class*="prompt"], h2, h3, p:first-of-type'
            )?.textContent.trim();
            
            // Get answer choices
            const choices = [];
            const choiceElements = q.querySelectorAll(
                '[class*="choice"], [class*="option"], [class*="answer"], ' +
                '[role="radio"], [role="checkbox"], li, label'
            );
            
            choiceElements.forEach((choice, j) => {
                const text = choice.textContent.trim();
                const isCorrect = choice.classList.contains('correct') || 
                                  choice.getAttribute('data-correct') === 'true' ||
                                  choice.querySelector('[class*="correct"]');
                
                if (text && text.length > 0) {
                    choices.push({
                        text: text,
                        isCorrect: !!isCorrect
                    });
                }
            });

            // Get feedback
            const feedback = q.querySelector('[class*="feedback"], [class*="Feedback"], .explanation')?.textContent.trim();

            if (questionText) {
                checks.push({
                    id: `kc-${i}`,
                    question: questionText,
                    choices: choices,
                    feedback: feedback || '',
                    type: 'knowledge-check'
                });
            }
        });

        return checks;
    }

    /**
     * Extract accordion content
     */
    function extractAccordions(doc) {
        const accordions = [];
        
        const accordionElements = doc.querySelectorAll(
            '[class*="accordion"], [class*="Accordion"], [data-type="accordion"], ' +
            '[class*="expandable"], [class*="collapsible"], details'
        );
        
        accordionElements.forEach((acc, i) => {
            const header = acc.querySelector(
                '[class*="header"], [class*="title"], [class*="trigger"], ' +
                'summary, button[aria-expanded], h2, h3'
            )?.textContent.trim();
            
            const content = acc.querySelector(
                '[class*="content"], [class*="panel"], [class*="body"], ' +
                '[aria-hidden], .accordion-content'
            )?.textContent.trim();
            
            if (header || content) {
                accordions.push({
                    id: `accordion-${i}`,
                    header: header || '',
                    content: content || '',
                    type: 'accordion'
                });
            }
        });

        return accordions;
    }

    /**
     * Extract tabbed content
     */
    function extractTabs(doc) {
        const tabSets = [];
        
        const tabContainers = doc.querySelectorAll(
            '[class*="tabs"], [class*="Tabs"], [role="tablist"], ' +
            '[class*="tab-container"], .tabs-block'
        );
        
        tabContainers.forEach((container, i) => {
            const tabs = [];
            const tabButtons = container.querySelectorAll('[role="tab"], [class*="tab-button"], button');
            const tabPanels = container.querySelectorAll('[role="tabpanel"], [class*="tab-panel"], [class*="tab-content"]');
            
            tabButtons.forEach((btn, j) => {
                const label = btn.textContent.trim();
                const panel = tabPanels[j];
                const content = panel?.textContent.trim() || '';
                
                if (label) {
                    tabs.push({
                        label: label,
                        content: content
                    });
                }
            });

            if (tabs.length > 0) {
                tabSets.push({
                    id: `tabset-${i}`,
                    tabs: tabs,
                    type: 'tab-set'
                });
            }
        });

        return tabSets;
    }

    /**
     * Extract images with alt text and captions
     */
    function extractImages(doc) {
        const images = [];
        
        const imgElements = doc.querySelectorAll('img');
        imgElements.forEach((img, i) => {
            const src = img.src;
            const alt = img.alt;
            const caption = img.closest('figure')?.querySelector('figcaption')?.textContent.trim();
            
            // Skip tiny images (likely icons)
            if (img.naturalWidth > 100 || img.width > 100) {
                images.push({
                    id: `img-${i}`,
                    src: src,
                    alt: alt || '',
                    caption: caption || '',
                    type: 'image'
                });
            }
        });

        return images;
    }

    /**
     * Extract text blocks/paragraphs
     */
    function extractTextBlocks(doc) {
        const blocks = [];
        
        // Get meaningful text content
        const textElements = doc.querySelectorAll(
            'p, [class*="text-block"], [class*="content-block"], ' +
            '.block-text, article, section > div'
        );
        
        const seenText = new Set();
        
        textElements.forEach((el, i) => {
            const text = el.textContent.trim();
            // Filter out short text, navigation, and duplicates
            if (text && text.length > 50 && !seenText.has(text)) {
                seenText.add(text);
                blocks.push({
                    id: `text-${i}`,
                    content: text,
                    type: 'text-block'
                });
            }
        });

        return blocks;
    }

    /**
     * Extract lists
     */
    function extractLists(doc) {
        const lists = [];
        
        const listElements = doc.querySelectorAll('ul, ol');
        listElements.forEach((list, i) => {
            const items = Array.from(list.querySelectorAll(':scope > li'))
                .map(li => li.textContent.trim())
                .filter(text => text.length > 0);
            
            // Get any heading before the list
            const prevSibling = list.previousElementSibling;
            const heading = prevSibling?.matches('h1, h2, h3, h4, h5, h6, p') 
                ? prevSibling.textContent.trim() 
                : '';
            
            if (items.length > 0) {
                lists.push({
                    id: `list-${i}`,
                    heading: heading,
                    items: items,
                    ordered: list.tagName === 'OL',
                    type: 'list'
                });
            }
        });

        return lists;
    }

    /**
     * Extract tables
     */
    function extractTables(doc) {
        const tables = [];
        
        const tableElements = doc.querySelectorAll('table');
        tableElements.forEach((table, i) => {
            const headers = Array.from(table.querySelectorAll('th'))
                .map(th => th.textContent.trim());
            
            const rows = [];
            table.querySelectorAll('tbody tr, tr:not(:first-child)').forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('td'))
                    .map(td => td.textContent.trim());
                if (cells.length > 0) {
                    rows.push(cells);
                }
            });

            if (headers.length > 0 || rows.length > 0) {
                tables.push({
                    id: `table-${i}`,
                    headers: headers,
                    rows: rows,
                    type: 'table'
                });
            }
        });

        return tables;
    }

    /**
     * Extract video information
     */
    function extractVideos(doc) {
        const videos = [];
        
        // HTML5 video elements
        const videoElements = doc.querySelectorAll('video');
        videoElements.forEach((video, i) => {
            videos.push({
                id: `video-${i}`,
                src: video.src || video.querySelector('source')?.src || '',
                poster: video.poster || '',
                type: 'video'
            });
        });

        // YouTube/Vimeo embeds
        const iframes = doc.querySelectorAll('iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"]');
        iframes.forEach((iframe, i) => {
            videos.push({
                id: `video-embed-${i}`,
                src: iframe.src,
                type: 'video-embed'
            });
        });

        return videos;
    }

    /**
     * Get raw text from the entire document
     */
    function extractRawText(doc) {
        const body = doc.body;
        if (!body) return '';
        
        // Clone and remove scripts/styles
        const clone = body.cloneNode(true);
        clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
        
        return clone.textContent
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 10000); // Limit to 10k characters
    }

    /**
     * Handle messages from popup
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('Content script received message:', request.action);

        if (request.action === 'getPageInfo') {
            const metadata = extractSkilljarMetadata();
            sendResponse({
                success: true,
                data: {
                    course: metadata.course,
                    lesson: metadata.lesson
                }
            });
        }
        else if (request.action === 'scrapeMainPage') {
            const metadata = extractSkilljarMetadata();
            const content = extractMainPageContent();
            const iframeContent = extractIframeContent();
            
            // Merge iframe content into main content
            Object.keys(iframeContent).forEach(key => {
                if (Array.isArray(content[key]) && Array.isArray(iframeContent[key])) {
                    content[key] = [...content[key], ...iframeContent[key]];
                } else if (iframeContent[key]) {
                    content[key] = iframeContent[key];
                }
            });

            sendResponse({
                success: true,
                data: {
                    metadata: metadata,
                    content: content
                }
            });
        }
        else if (request.action === 'scrapeIframe') {
            const content = extractIframeContent();
            sendResponse({
                success: true,
                data: {
                    content: content
                }
            });
        }

        return true; // Keep channel open for async response
    });

    console.log('Celigo U Scraper: Main content script loaded');
})();
