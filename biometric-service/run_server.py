import uvicorn

if __name__ == "__main__":
    print("================================================================")
    print("  E-CHUNAB BIOMETRIC VERIFICATION SERVICE STARTING ON PORT 8000 ")
    print("================================================================")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
