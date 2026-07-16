import os
import sys
from dotenv import load_dotenv

# Path'e ekle
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

load_dotenv()

# Override DB_HOST to localhost for running from the host machine
os.environ["DB_HOST"] = "localhost"

from alarms import send_push_notification

if __name__ == "__main__":
    print("Sending test push notification...")
    title = "Sut Sihirbazi Test Bildirimi"
    body = "Harika! Push bildirim altyapisi basariyla calisiyor! [Test]"
    send_push_notification(title, body)
    print("Notification sent successfully.")
