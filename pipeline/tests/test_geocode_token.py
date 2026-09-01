import pytest
import requests
import responses

import config
from geocode import get_token


@responses.activate
def test_get_token_returns_access_token():
    responses.add(responses.POST, config.ONEMAP_TOKEN_URL,
                  json={"access_token": "tok-123"}, status=200)
    assert get_token(requests.Session(), "e@x.com", "pw") == "tok-123"


@responses.activate
def test_get_token_raises_on_http_error():
    responses.add(responses.POST, config.ONEMAP_TOKEN_URL, json={}, status=401)
    with pytest.raises(requests.HTTPError):
        get_token(requests.Session(), "e@x.com", "pw")


@responses.activate
def test_get_token_raises_when_missing_token():
    responses.add(responses.POST, config.ONEMAP_TOKEN_URL, json={"foo": "bar"}, status=200)
    with pytest.raises(RuntimeError):
        get_token(requests.Session(), "e@x.com", "pw")
