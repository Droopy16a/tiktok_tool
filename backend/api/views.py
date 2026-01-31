from rest_framework.decorators import api_view
from rest_framework.response import Response
import numpy as np
from kokoro import KPipeline, KModel
import whisper
import torch
import torchaudio
import base64
import json
import tempfile
import os
from pathlib import Path
from .tiktok import TikTokUploader, CookieManager, Config
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time

@api_view(["GET"])
def health(request):
    text = request.query_params.get("age")
    return Response({
        "status": "ok",
        "message": "Django API is running 🚀",
        "age" : text
    })

@api_view(["POST"])
def tts(request):
    text = request.data.get("text")

    if not text:
        return Response(
            {"status": "error", "message": "text is required"},
            status=400
        )

    voice = "bm_george"
    speed = float(request.data.get("speed", 1.0))

    # Initialize pipeline
    pipeline = KPipeline(lang_code="a")

    # Load voice pack
    pack = pipeline.load_voice(voice)

    # Initialize model ONCE
    model = KModel().eval()

    audio_chunks = []

    for _, ps, _ in pipeline(text, voice, speed):
        ref_s = pack[len(ps) - 1]
        audio = model(ps, ref_s, speed)
        audio_chunks.append(audio.cpu().numpy())

    if not audio_chunks:
        return Response(
            {"status": "error", "message": "No audio generated"},
            status=500
        )

    audio_array = np.concatenate(audio_chunks)
    sample_rate = 24000

    return Response({
        "status": "ok",
        "audio_array": audio_array.tolist(),  # ✅ JSON safe
        "sample_rate": sample_rate
    })

@api_view(["POST"])
def asr(request):
    audio_array = request.data.get("audio_array")
    sample_rate = request.data.get("sample_rate", 24000)

    if not audio_array:
        return Response(
            {"status": "error", "message": "audio_array is required"},
            status=400
        )

    # Convert to numpy array
    audio = np.array(audio_array, dtype=np.float32)

    # Resample to 16kHz if necessary
    if sample_rate != 16000:
        resampler = torchaudio.transforms.Resample(sample_rate, 16000)
        audio = resampler(torch.from_numpy(audio)).numpy()

    # Load Whisper model (small for efficiency)
    model = whisper.load_model("small")

    # Transcribe
    result = model.transcribe(audio, fp16=False, word_timestamps=True)  # fp16=False for CPU

    return Response({
        "status": "ok",
        "text": result["text"],
        "segments": result["segments"]  # Includes timestamps
    })

@api_view(["POST"])
def upload_tiktok(request):
    """Upload video to TikTok"""
    video_blob = request.FILES.get("video")
    username = request.data.get("username")
    title = request.data.get("title", "Generated Video")
    visibility = request.data.get("visibility", "PRIVATE")
    
    if not video_blob:
        return Response(
            {"status": "error", "message": "video file is required"},
            status=400
        )
    
    if not username:
        return Response(
            {"status": "error", "message": "username is required"},
            status=400
        )
    
    try:
        # Initialize config
        config = Config.get()
        cookie_manager = CookieManager(config)
        
        # Load cookies for the user
        cookies = cookie_manager.load_cookies(username)
        if not cookies:
            return Response(
                {"status": "error", "message": f"Cookies not found for user {username}. Please register first."},
                status=400
            )
        
        # Save video to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp_file:
            for chunk in video_blob.chunks():
                tmp_file.write(chunk)
            tmp_video_path = tmp_file.name
        
        try:
            # Initialize uploader
            uploader = TikTokUploader(cookies)
            
            # Upload to TikTok
            success = uploader.upload_video(
                video_path=tmp_video_path,
                title=title,
                visibility=visibility,
                allow_comments=True,
                allow_duet=True,
                allow_stitch=True
            )
            
            if success:
                return Response({
                    "status": "ok",
                    "message": "Video uploaded to TikTok successfully"
                })
            else:
                return Response(
                    {"status": "error", "message": "Failed to upload video to TikTok"},
                    status=500
                )
        finally:
            # Clean up temporary file
            if os.path.exists(tmp_video_path):
                os.remove(tmp_video_path)
    
    except Exception as e:
        return Response(
            {"status": "error", "message": str(e)},
            status=500
        )

@api_view(["POST"])
def register_tiktok(request):
    """Register TikTok cookies for a user"""
    username = request.data.get("username")
    cookies_data = request.data.get("cookies")
    
    if not username or not cookies_data:
        return Response(
            {"status": "error", "message": "username and cookies are required"},
            status=400
        )
    
    try:
        config = Config.get()
        cookie_manager = CookieManager(config)
        
        if cookie_manager.save_cookies(cookies_data, username):
            return Response({
                "status": "ok",
                "message": f"Cookies registered for {username}"
            })
        else:
            return Response(
                {"status": "error", "message": "Failed to save cookies"},
                status=500
            )
    except Exception as e:
        return Response(
            {"status": "error", "message": str(e)},
            status=500
        )

@api_view(["POST"])
def auto_register_tiktok(request):
    """Automatically extract and register TikTok cookies using Selenium"""
    username = request.data.get("username")
    password = request.data.get("password")
    tiktok_username = request.data.get("tiktok_username")
    
    if not username or not password or not tiktok_username:
        return Response(
            {"status": "error", "message": "username, password, and tiktok_username are required"},
            status=400
        )
    
    driver = None
    try:
        # Initialize Chrome driver with improved options
        options = webdriver.ChromeOptions()
        # options.add_argument('--headless=new')  # Use new headless mode
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--window-size=1920,1080')
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        driver = webdriver.Chrome(options=options)
        
        # Remove webdriver property
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        # Open TikTok login page
        print("Opening TikTok login page...")
        driver.get("https://www.tiktok.com/login/phone-or-email/email")
        time.sleep(5)  # Increased wait time
        
        try:
            # Try multiple selectors for the username/email field
            email_input = None
            selectors = [
                (By.NAME, "username"),
                (By.CSS_SELECTOR, "input[type='text']"),
                (By.CSS_SELECTOR, "input[placeholder*='email' i]"),
                (By.CSS_SELECTOR, "input[placeholder*='username' i]"),
                (By.XPATH, "//input[@type='text']")
            ]
            
            for by, selector in selectors:
                try:
                    email_input = WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((by, selector))
                    )
                    if email_input:
                        print(f"Found email input with selector: {by}, {selector}")
                        break
                except TimeoutException:
                    continue
            
            if not email_input:
                return Response(
                    {"status": "error", "message": "Could not locate email/username input field"},
                    status=400
                )
            
            # Clear and enter username
            email_input.clear()
            time.sleep(0.5)
            email_input.send_keys(username)
            time.sleep(2)
            
            # Try multiple selectors for password field
            password_input = None
            password_selectors = [
                (By.NAME, "password"),
                (By.CSS_SELECTOR, "input[type='password']"),
                (By.XPATH, "//input[@type='password']")
            ]
            
            for by, selector in password_selectors:
                try:
                    password_input = driver.find_element(by, selector)
                    if password_input:
                        print(f"Found password input with selector: {by}, {selector}")
                        break
                except NoSuchElementException:
                    continue
            
            if not password_input:
                return Response(
                    {"status": "error", "message": "Could not locate password input field"},
                    status=400
                )
            
            password_input.clear()
            time.sleep(0.5)
            password_input.send_keys(password)
            time.sleep(2)
            
            # Try multiple selectors for login button
            login_button = None
            button_selectors = [
                (By.XPATH, "//button[contains(text(), 'Log in')]"),
                (By.XPATH, "//button[@type='submit']"),
                (By.CSS_SELECTOR, "button[type='submit']"),
                (By.XPATH, "//button[contains(@class, 'login')]")
            ]
            
            for by, selector in button_selectors:
                try:
                    login_button = driver.find_element(by, selector)
                    if login_button:
                        print(f"Found login button with selector: {by}, {selector}")
                        break
                except NoSuchElementException:
                    continue
            
            if not login_button:
                return Response(
                    {"status": "error", "message": "Could not locate login button"},
                    status=400
                )
            
            # Click login button using JavaScript to avoid interception
            print("Clicking login button...")
            driver.execute_script("arguments[0].click();", login_button)
            time.sleep(3)

            # Try to find and click email verification option if it appears
            mail_button = None
            mail_button_selectors = [
                (By.XPATH, "//div[.//text()[contains(., 'E-mail')]]"),
                (By.XPATH, "//div[contains(text(), 'Email')]"),
                (By.XPATH, "//button[contains(text(), 'Email')]"),
                (By.XPATH, "//div[contains(@class, 'email')]//parent::button"),
                (By.CSS_SELECTOR, "button[data-e2e='email-verification']")
            ]

            for by, selector in mail_button_selectors:
                try:
                    mail_button = WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((by, selector))
                    )
                    if mail_button:
                        print(f"Found email button with selector: {by}, {selector}")
                        break
                except (NoSuchElementException, TimeoutException):
                    continue
                
            if mail_button:
                try:
                    # Scroll element into view first
                    driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", mail_button)
                    time.sleep(1)
                    
                    # Try JavaScript click to avoid interception
                    driver.execute_script("arguments[0].click();", mail_button)
                    print("Clicked email button using JavaScript")
                    time.sleep(3)
                except Exception as e:
                    print(f"Could not click email button: {e}")
                    # Continue anyway - email button might not always appear

            # Wait for login to complete - check multiple indicators
            time.sleep(10)  # Initial wait for potential redirects
            
            # Check if we're logged in by looking for common post-login elements
            logged_in = False
            login_indicators = [
                (By.XPATH, "//a[@href='/']"),
                (By.CSS_SELECTOR, "a[href='/foryou']"),
                (By.CSS_SELECTOR, "div[data-e2e='profile-icon']"),
                (By.XPATH, "//div[contains(@class, 'avatar')]")
            ]
            
            for by, selector in login_indicators:
                try:
                    WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((by, selector))
                    )
                    logged_in = True
                    print(f"Login confirmed with selector: {by}, {selector}")
                    break
                except TimeoutException:
                    continue
            
            if not logged_in:
                # Take a screenshot for debugging
                screenshot_path = f"/tmp/tiktok_login_failed_{int(time.time())}.png"
                driver.save_screenshot(screenshot_path)
                print(f"Screenshot saved to: {screenshot_path}")
                
                return Response(
                    {"status": "error", "message": "Login verification failed. Check if credentials are correct or if CAPTCHA appeared."},
                    status=400
                )
            
            # Extract cookies
            print("Extracting cookies...")
            cookies_dict = {}
            for cookie in driver.get_cookies():
                cookies_dict[cookie['name']] = cookie['value']
            
            print(f"Extracted {len(cookies_dict)} cookies")
            print(f"Cookie names: {list(cookies_dict.keys())}")
            
            # Check for essential cookies
            essential_cookies = ['sessionid', 'sid_tt', 'sessionid_ss']
            found_essential = [c for c in essential_cookies if c in cookies_dict]
            
            if not found_essential:
                return Response(
                    {"status": "error", "message": f"Failed to obtain essential cookies. Found cookies: {list(cookies_dict.keys())}"},
                    status=400
                )
            
            print(f"Found essential cookies: {found_essential}")
            
            # Save cookies
            config = Config.get()
            cookie_manager = CookieManager(config)
            
            if cookie_manager.save_cookies(cookies_dict, tiktok_username):
                return Response({
                    "status": "ok",
                    "message": f"Cookies automatically extracted and registered for {tiktok_username}",
                    "cookies_count": len(cookies_dict),
                    "essential_cookies": found_essential
                })
            else:
                return Response(
                    {"status": "error", "message": "Failed to save cookies"},
                    status=500
                )
        
        except TimeoutException as te:
            screenshot_path = f"/tmp/tiktok_timeout_{int(time.time())}.png"
            driver.save_screenshot(screenshot_path)
            return Response(
                {"status": "error", "message": f"Timeout waiting for element: {str(te)}. Screenshot saved to {screenshot_path}"},
                status=400
            )
    
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error trace: {error_trace}")
        
        if driver:
            try:
                screenshot_path = f"/tmp/tiktok_error_{int(time.time())}.png"
                driver.save_screenshot(screenshot_path)
                print(f"Error screenshot saved to: {screenshot_path}")
            except:
                pass
        
        return Response(
            {"status": "error", "message": f"Automation failed: {str(e)}", "trace": error_trace},
            status=500
        )
    
    finally:
        if driver:
            driver.quit()